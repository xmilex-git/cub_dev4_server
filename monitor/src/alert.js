// alert.js — turn findings into notifications with cooldown, escalation, and
// resolve handling. The sink is selectable: a Discord embed or a Microsoft Teams
// Adaptive Card (config.notifier).
//
// State machine, keyed by alertKey = `${entity}:${kind}:${detailKey}`:
//   - First time a condition fires (or escalates warn->crit): dispatch now.
//   - Same condition within cooldownSec: suppress (debounce).
//   - Condition absent for `resolveAfterClears` consecutive evaluations: forget
//     the key, and (only when config.sendResolve) send a RESOLVE message.
//
// Delivery: POST via global fetch with retries + backoff. If all attempts fail,
// log the alert to stderr so journald keeps it (never silently lost). In
// dry-run, print to stdout and never POST.
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
        // Only POST a RESOLVE when configured to. Either way the key is forgotten
        // (after the same hysteresis) so a later recurrence alerts cleanly.
        if (this.config.sendResolve) {
          await this.sendResolve(state.finding);
          resolved.push(state.finding);
        }
        this.active.delete(key);
        this.clearing.delete(key);
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
    await this.deliver(finding, { escalated });
  }

  async sendResolve(finding) {
    await this.deliver(finding, { resolve: true });
  }

  /**
   * Short, secret-free title line for a finding. Used by both payload builders
   * and the dry-run log.
   */
  titleFor(finding, { resolve = false, escalated = false } = {}) {
    const prefix = resolve ? 'RESOLVED' : escalated ? 'ESCALATED' : finding.severity.toUpperCase();
    const entityLabel = finding.name ? `${finding.name} (${shortId(finding.entity)})` : String(finding.entity);
    return `[${prefix}] ${finding.kind} — ${entityLabel}`;
  }

  /**
   * Resolve the owner @mention for a CONTAINER-scoped finding from
   * config.teams.mentions, keyed by the owner base name in the container name
   * (the [a-z]+ run after the leading "<num>-", e.g. "34-ilhansong_data2" ->
   * "ilhansong"). Returns { name, id } or null (host findings, or no mapping).
   */
  ownerMention(finding) {
    if (!finding || finding.entity === 'host' || typeof finding.name !== 'string') return null;
    const mentions = this.config.teams && this.config.teams.mentions;
    if (!mentions) return null;
    const m = /^\d+-([a-z]+)/.exec(finding.name);
    const who = m ? mentions[m[1]] : null;
    return who && who.id && who.name ? who : null;
  }

  /**
   * Build the Microsoft Teams payload: a Power Automate "Workflows" message
   * envelope wrapping an Adaptive Card. The card carries the container name and
   * the warning content (finding.msg). When the container maps to an owner in
   * config.teams.mentions, the card also @mentions that owner (an <at> token in
   * the headline plus an msteams.entities mention) so they get pinged. Resolves
   * never tag (recovery is good news, no need to ping). Teams returns 202 on
   * success (handled by res.ok).
   */
  buildTeamsPayload(finding, { resolve = false, escalated = false } = {}) {
    const prefix = resolve ? 'RESOLVED' : escalated ? 'ESCALATED' : finding.severity.toUpperCase();
    const entityLabel = finding.name ? `${finding.name} (${shortId(finding.entity)})` : String(finding.entity);
    const who = resolve ? null : this.ownerMention(finding);
    const headline = who ? `<at>${who.name}</at> [${prefix}] ${entityLabel}` : `[${prefix}] ${entityLabel}`;
    const content = {
      $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        { type: 'TextBlock', text: headline, weight: 'Bolder', size: 'Medium', wrap: true },
        { type: 'TextBlock', text: finding.msg, wrap: true },
        { type: 'TextBlock', text: 'podman-watchdog (read-only, no-kill)', size: 'Small', isSubtle: true, wrap: true },
      ],
    };
    if (who) {
      content.msteams = {
        entities: [{ type: 'mention', text: `<at>${who.name}</at>`, mentioned: { id: who.id, name: who.name } }],
      };
    }
    return {
      type: 'message',
      attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content }],
    };
  }

  /**
   * Deliver an alert for `finding` to the configured sink (discord | teams).
   * Dry-run prints and returns. Otherwise POST with retries + exponential
   * backoff; on total failure, log to stderr (journald) so the alert is
   * preserved (never silently lost).
   */
  async deliver(finding, { resolve = false, escalated = false } = {}) {
    const notifier = this.config.notifier;
    const payload = notifier === 'teams'
      ? this.buildTeamsPayload(finding, { resolve, escalated })
      : this.buildEmbed(finding, { resolve, escalated });

    if (this.dryRun) {
      this.stdout(`[dry-run alert] ${JSON.stringify(this.titleFor(finding, { resolve, escalated }))} :: ${finding.msg}`);
      return;
    }

    const sink = this.config[notifier];
    const url = sink.webhookUrl;
    if (!url) {
      this.stderr(`[alert:no-webhook] ${finding.msg}`);
      return;
    }

    const { retries, backoffMs } = sink;
    let lastErr = null;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const res = await this.fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (res.ok || res.status === 204) return;
        // Honour a rate-limit hint when present (Discord 429 / Teams throttle).
        if (res.status === 429) {
          const retryAfter = Number(res.headers?.get?.('retry-after'));
          if (Number.isFinite(retryAfter) && retryAfter > 0) {
            await this.sleep(retryAfter * 1000);
            continue;
          }
        }
        lastErr = new Error(`${notifier} webhook returned HTTP ${res.status}`);
      } catch (err) {
        lastErr = err;
      }
      if (attempt < retries) {
        await this.sleep(backoffMs * 2 ** attempt);
      }
    }

    // Fallback: never lose the alert. Log it to stderr (journald).
    this.stderr(
      `[alert:webhook-failed] ${lastErr ? lastErr.message : 'unknown error'} :: ${this.titleFor(finding, { resolve, escalated })} :: ${finding.msg}`,
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
