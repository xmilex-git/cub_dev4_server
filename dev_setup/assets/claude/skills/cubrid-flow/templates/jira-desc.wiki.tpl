{{!--
JIRA description template for CUBRID spec / Development Subject tickets.

Rules (재설명 금지 — 본 헤더가 canonical reference):
1. Title (issue summary): English OK, < 70 chars, action-oriented.
2. Body 언어: Korean prose. 식별자(함수명/변수명/타입명/매크로/build mode 등)는 영어 그대로, plain text — `{{...}}` inline-code markup 사용 금지.
3. 5개 섹션 정확히 이 순서, 추가 금지·생략 금지:
     Description / Specification Changes / Implementation / Acceptance Criteria / Definition of done
4. 섹션 헤딩: `h2. *<Name>*` (별표로 bold).
5. 서브-섹션 헤딩: 별도 라인의 `*bold paragraph-lead*` — `h3.` 사용 금지.
6. 불릿: ` * item` (선행 1-space + asterisk). 서브-불릿: ` ** subitem`.
7. 섹션 헤딩 다음에 1 빈 줄, sub-heading 다음에 1 빈 줄, 그 다음 불릿. 섹션 사이 1 빈 줄.
8. Definition of done 은 보통 한 줄: "Acceptance Criteria를 만족한다."

Anti-patterns:
- Goal / Background / References / Migration 별도 섹션 → 5개 안에 fold.
- 식별자에 `{{}}` 또는 `{code}` 박스 사용 → plain text 만 사용.
- Sub-heading 을 `h3.` 으로 작성 → `*bold*` paragraph-lead 만.
- 불릿 들여쓰기 누락 (`* item` 만, 선행 space 없음) → ` * item` 으로 통일.
- 영어 prose 본문 → 모두 한국어로 번역.

Canonical example (CBRD-26722, 사용자 검증):

  h2. *Description*

  B+트리 인덱스 생성(CREATE INDEX / xbtree_load_index) 시, 힙 파일의 레코드를 읽고 정렬하는 단계를 여러 스레드로 병렬화하는 기능을 추가하고자 합니다. 기존 parallel sort (ORDER BY) 인프라를 재사용하며, 인덱스 빌드 전용 타입(SORT_INDEX_LEAF)에 대한 구현을 추가하는 방식으로 구현합니다.

  h2. *Specification Changes*

  *parallel index build를 지원하지 않는 경우*
   * n_classes > 1 (상속 관계 테이블이 존재하는 경우, 파티션은 지원)
   * 힙 파일의 섹터 수가 병렬도(parallel_num)보다 적은 경우
   * SA_MODE
   * 파티션이 있는 경우의 alter를 통한 PK, unique index build

  *parallel index build를 지원하는 경우*
   * 단일 클래스의 일반 테이블 대상 CREATE INDEX
   * parallel_num >= 2로 결정되는 경우 (parallel_query::compute_parallel_degree 기준)
   * 섹터 수가 parallel_num 이상인 경우

  h2. *Implementation*

  *힙 섹터 파티셔닝*
   * file_get_all_data_sectors로 힙 파일 전체 섹터 수집
   * ftab_set::split(parallel_num)으로 스레드별 균등 분할
   * 각 스레드가 자신에게 할당된 섹터만 스캔 (get_next_vpid)

  *스레드별 독립 실행 (sort_listfile_execute, SORT_INDEX_LEAF 분기)*
   * btree_load_filter_pred_function_info — filter/func index predicate 스레드별 독립 역직렬화
   * bt_load_heap_scancache_start_for_attrinfo — 스레드별 heap scancache 시작
   * btree_sort_get_next_parallel — 섹터 단위 페이지 이동으로 병렬 스캔 수행
   결과 머지 (sort_merge_run_for_parallel_index_leaf_build)
   * 각 스레드 결과 임시 파일을 SORT_PX_MERGE_FILES씩 tree-merge
   * 모든 머지 완료 후 btree_create_file → sort_put_result_from_tmpfile

  *SERVER_MODE / SA_MODE 분기*
   * SERVER_MODE: log_sysop_start / btree_create_file / heap scancache를 sort_listfile 내부로 위임
   * SA_MODE: 기존 순차 방식 유지

  *주요 변경 파일*
   * btree_load.h / btree_load.c — SORT_ARGS 구조체 이동·확장, FILTER_INDEX_INFO 신규, 병렬 스캔 함수 추가
   * external_sort.c / external_sort.h — SORT_INDEX_LEAF 분기 전방위 추가, 병렬 merge 함수 신규 추가
   * file_manager.c / file_manager.h — file_get_num_data_sectors 추가

  h2. *Acceptance Criteria*
   * 대량 데이터 대상 CREATE INDEX 시, 단일 스레드 대비 빠르게 인덱스를 빌드해야 함
   * 다음의 경우 병렬 인덱스 빌드를 오류 없이 수행할 수 있어야 함
   ** 단순 테이블 풀 스캔 기반 인덱스 빌드
   ** filter index / function index가 포함된 경우
   ** autocommit on 환경에서 커밋된 데이터에 대한 인덱스 빌드
   ** 병렬도가 2 미만이거나 섹터 수가 부족한 경우 단일 스레드로 fallback되어야 함
   ** 파티션 테이블의 경우

  h2. *Definition of done*

  Acceptance Criteria를 만족한다.
--}}

h2. *Description*

{{DESCRIPTION}}

h2. *Specification Changes*

{{SPEC_CHANGES}}

h2. *Implementation*

{{IMPLEMENTATION}}

h2. *Acceptance Criteria*

{{ACCEPTANCE}}

h2. *Definition of done*

{{DOD}}
