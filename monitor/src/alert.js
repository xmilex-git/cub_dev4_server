// alert.js — turn findings into Discord notifications with cooldown, escalation,
// and resolve handling.
//
// State machine, keyed by alertKey = `${entity}:${kind}:${detailKey}`:
//   - First time a condition fires (or escalates warn->crit): dispatch now.
//   - Same condition within cooldownSec: suppress (debounce).
//   - Condition absent for `resolveAfterClears` consecutive evaluations: send a
//     RESOLVE message and forget the key.
//
// Delivery: POST a Discord embed via global fetch with retries + backoff. If all
// attempts fail, log the full alert to stderr so journald keeps it (alert is
// never silently lost). In dry-run, print to stdout and never POST.
//
// The webhook URL is held only in memory (from config) and is never logged or
// written to state.

const SEVERITY_RANK = { warn: 1, crit: 2 };
const SEVERITY_COLOR = { warn: 0xf1c40f, crit: 0xe74c3c, resolve: 0x2ecc71 };

/**
 * Stable, secret-free key for a finding. Memory findings include the reason so
 * a PSI alert and an avail alert on the host are tracked separately.
 */
export function alertKey(finding) {
  const detailKey = finding.detail?.reason ?? finding.kind;
  return `${finding.entity}:${finding.kind}:${detailKey}`;
}

export class AlertManager {
  /**
   * @param {object} config
   * @param {object} [opts]
   * @param {boolean} [opts.dryRun=false]
   * @param {(url:string, init:object)=>Promise<Response>} [opts.fetchImpl=fetch]
   * @param {(ms:number)=>Promise<void>} [opts.sleep]
   * @param {(line:string)=>void} [opts.stdout]
   * @param {(line:string)=>void} [opts.stderr]
   * @param {()=>number} [opts.now]
   */
  constructor(config, opts = {}) {
    this.config = config;
    this.dryRun = opts.dryRun ?? false;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.stdout = opts.stdout ?? ((line) => process.stdout.write(`${line}\n`));
    this.stderr = opts.stderr ?? ((line) => process.stderr.write(`${line}\n`));
    this.now = opts.now ?? (() => Date.now());

    /**
     * Active alert state per key:
     *   { severity, lastSentMs, finding }
     * @type {Map<string, {severity:string, lastSentMs:number, finding:object}>}
     */
    this.active = new Map();
    /**
     * Consecutive "clear" counts for keys that were active but are now absent.
     * @type {Map<string, number>}
     */
    this.clearing = new Map();
  }

  /**
   * Process this evaluation's findings: send/suppress/escalate, and emit
   * resolves for conditions that have cleared. Returns a summary of actions for
   * logging/state.
   *
   * @param {Array<object>} findings
   * @returns {Promise<{sent:Array<object>, suppressed:Array<object>, resolved:Array<object>}>}
   */
  async dispatch(findings) {
    const nowMs = this.now();
    const cooldownMs = this.config.cooldownSec * 1000;
    const seen = new Set();
    const sent = [];
    const suppressed = [];
    const resolved = [];

    for (const f of findings) {
      const key = alertKey(f);
      seen.add(key);
      // A condition reappearing cancels any in-progress resolve countdown.
      this.clearing.delete(key);

      const prev = this.active.get(key);
      const escalated = prev && SEVERITY_RANK[f.severity] > SEVERITY_RANK[prev.severity];
      const cooledDown = prev && nowMs - prev.lastSentMs >= cooldownMs;

      if (!prev || escalated || cooledDown) {
        await this.send(f, { escalated: Boolean(escalated) });
        this.active.set(key, { severity: f.severity, lastSentMs: nowMs, finding: f });
        sent.push(f);
      } else {
        // De-escalation (crit -> warn) keeps the higher tracked severity but
        // refreshes the stored finding so resolve text is accurate.
        this.active.set(key, { ...prev, finding: f });
        suppressed.push(f);
      }
    }

    // Resolve handling: any active key not seen this round advances its clear
    // counter; once it reaches the threshold, emit RESOLVE and forget it.
    for (const [key, state] of this.active) {
      if (seen.has(key)) continue;
      const count = (this.clearing.get(key) ?? 0) + 1;
      if (count >= this.config.resolveAfterClears) {
        await this.sendResolve(state.finding);
        this.active.delete(key);
        this.clearing.delete(key);
        resolved.push(state.finding);
      } else {
        this.clearing.set(key, count);
      }
    }

    return { sent, suppressed, resolved };
  }

  /**
   * Build the Discord embed payload for a finding. Includes severity, entity,
   * culprit (name/PID/comm/threads if attributed), the ratio/value, and time.
   */
  buildEmbed(finding, { resolve = false, escalated = false } = {}) {
    const sev = resolve ? 'resolve' : finding.severity;
    const entityLabel = finding.name ? `${finding.name} (${shortId(finding.entity)})` : finding.entity;
    const titlePrefix = resolve ? 'RESOLVED' : escalated ? 'ESCALATED' : finding.severity.toUpperCase();
    const fields = [
      { name: 'Entity', value: entityLabel, inline: true },
      { name: 'Kind', value: finding.kind, inline: true },
    ];

    if (finding.detail?.current !== undefined && finding.detail?.max !== undefined) {
      const ratioPct = finding.ratio !== null ? `${(finding.ratio * 100).toFixed(1)}%` : 'n/a';
      fields.push({
        name: 'PIDs',
        value: `${finding.detail.current} / ${finding.detail.max} (${ratioPct})`,
        inline: true,
      });
    }

    const culprit = finding.culprit;
    if (culprit) {
      fields.push({
        name: 'Top consumer',
        value: `${culprit.comm ?? '?'} pid=${culprit.pid ?? '?'} threads=${culprit.threads ?? '?'}`,
        inline: false,
      });
    }

    return {
      embeds: [
        {
          title: `[${titlePrefix}] ${finding.kind} — ${entityLabel}`,
          description: finding.msg,
          color: SEVERITY_COLOR[sev] ?? SEVERITY_COLOR.warn,
          fields,
          timestamp: new Date(finding.ts ?? this.now()).toISOString(),
          footer: { text: 'podman-watchdog (read-only, no-kill)' },
        },
      ],
    };
  }

  async send(finding, { escalated = false } = {}) {
    const payload = this.buildEmbed(finding, { escalated });
    await this.deliver(payload, finding);
  }

  async sendResolve(finding) {
    const payload = this.buildEmbed(finding, { resolve: true });
    await this.deliver(payload, finding);
  }

  /**
   * Deliver a payload. Dry-run prints and returns. Otherwise POST with retries
   * and exponential backoff; on total failure, log to stderr (journald) so the
   * alert is preserved.
   */
  async deliver(payload, finding) {
    if (this.dryRun) {
      this.stdout(`[dry-run alert] ${JSON.stringify(payload.embeds[0].title)} :: ${finding.msg}`);
      return;
    }

    const url = this.config.discord.webhookUrl;
    if (!url) {
      this.stderr(`[alert:no-webhook] ${finding.msg}`);
      return;
    }

    const { retries, backoffMs } = this.config.discord;
    let lastErr = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const res = await this.fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok || res.status === 204) return;
        // Honour Discord rate-limit hints when present.
        if (res.status === 429) {
          const retryAfter = Number(res.headers?.get?.('retry-after'));
          if (Number.isFinite(retryAfter) && retryAfter > 0) {
            await this.sleep(retryAfter * 1000);
            continue;
          }
        }
        lastErr = new Error(`Discord webhook returned HTTP ${res.status}`);
      } catch (err) {
        lastErr = err;
      }
      if (attempt < retries) {
        await this.sleep(backoffMs * 2 ** attempt);
      }
    }

    // Fallback: never lose the alert. Log the full content to stderr (journald).
    this.stderr(
      `[alert:webhook-failed] ${lastErr ? lastErr.message : 'unknown error'} :: ${finding.msg} :: ${JSON.stringify(payload.embeds[0].fields)}`,
    );
  }

  /**
   * Secret-free view of active alerts for state.json.
   */
  snapshot() {
    return [...this.active.entries()].map(([key, state]) => ({
      key,
      severity: state.severity,
      entity: state.finding.entity,
      name: state.finding.name,
      kind: state.finding.kind,
      msg: state.finding.msg,
      lastSentMs: state.lastSentMs,
    }));
  }
}

function shortId(id) {
  return typeof id === 'string' && id.length > 12 ? id.slice(0, 12) : id;
}
