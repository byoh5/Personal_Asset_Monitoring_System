# GitHub Pages용 Asset Monitoring Viewer

정적 웹 페이지로 동작하는 경량 웹 버전입니다.

## 기능
- 엑셀 파일 업로드 후 `대시보드`, `자산` 화면 조회
- `데모 데이터 불러오기` 버튼으로 40대 초반 1인 기준 샘플 자산 즉시 로드
- 엑셀 없이도 자산 직접 추가/삭제 가능
- `자산 분석` 메뉴에서 설문 기반 분석 리포트(비상자금/저축률/배분 비교/추천 액션) 생성
- `자산 분석` 메뉴에서 OpenAI 기반 확장 리포트(요약/강점/리스크/30일·90일 액션) 생성
- 직접 입력 시 자산 타입별 옵션 필드(증권: 티커/시장/수량/현재가, 예적금/부채: 기관/계좌/금리/만기) 제공
- 마지막 작업 데이터 자동 복원(같은 브라우저/기기 재접속 시 파일 재선택 없이 이어보기)
- 자산 페이지 `JSON 자산 입력기`로 외부 LLM 결과 JSON 미리보기/수정/반영
- `매뉴얼` 페이지에서 웹 전용 사용 흐름 및 LLM 프롬프트 복사 제공
- `정보` 페이지에서 제품 소개, 보안 처리 방식, Web Edition 오픈소스 고지 제공
- 수정된 자산 데이터를 브라우저에서 엑셀(`Assets`, `Dashboard`)로 저장
- 다크/라이트 테마 토글
- 기본 기능은 서버/DB 없이 브라우저에서만 동작 (OpenAI 확장 리포트는 서버리스 API 필요)

## 실행
`web_github_pages/index.html`을 브라우저로 열면 됩니다.

## GitHub Pages 배포
1. 저장소에 `web_github_pages` 폴더를 커밋
2. GitHub Pages Source를 해당 브랜치로 설정
3. 배포 루트를 `/web_github_pages`로 맞추거나, 루트 배포 시 폴더 내용을 루트로 복사

## OpenAI API 연동 (서버리스 보안)
프론트엔드만으로 OpenAI API를 호출하면 키가 노출되므로, 반드시 서버리스 함수에서 호출해야 합니다.

### 1) 계정 연결 방식
- OpenAI 계정의 API 키를 발급해 서버 환경변수(`OPENAI_API_KEY`)로 저장합니다.
- 이 프로젝트는 OpenAI OAuth 로그인 연결이 아니라, 서버가 API 키로 대리 호출하는 방식입니다.

### 2) 포함된 서버리스 코드
- `api/openai-asset-report.js`: OpenAI 호출 프록시 엔드포인트
- `.env.example`: 필요한 환경변수 예시
- `vercel.json`: Vercel 함수 런타임 설정

### 3) Vercel로 한 번에 배포 (권장)
1. Vercel에서 `web_github_pages` 디렉토리를 프로젝트 루트로 배포
2. 환경변수 설정
   - `OPENAI_API_KEY`: OpenAI API 키
   - `OPENAI_MODEL` (선택): 기본 `gpt-4.1-mini`
   - `OPENAI_MAX_OUTPUT_TOKENS` (선택): 기본 `360` (응답 길이/비용 상한)
   - `OPENAI_PROMPT_CACHE_KEY` (선택): 기본 `asset-report-v2` (Prompt Caching 히트율 안정화)
   - `OPENAI_PROMPT_CACHE_RETENTION` (선택): `in_memory` 또는 `24h` (모델 지원 시)
   - `OPENAI_RESPONSE_CACHE_TTL_MS` (선택): 기본 `300000` (동일 입력 서버 응답 재사용)
   - `CORS_ORIGIN` (선택): 특정 도메인 제한 시 설정
3. 배포 후 프론트의 `자산 분석 > OpenAI 확장 리포트`에서 API URL을 기본값(`/api/openai-asset-report`)으로 사용

### 4) GitHub Pages + 별도 서버리스 조합
1. 프론트는 GitHub Pages로 유지
2. 서버리스(API)는 Vercel/Netlify/Cloudflare Workers 중 하나로 별도 배포
3. `자산 분석 > OpenAI 확장 리포트`의 API URL 입력칸에 전체 URL 입력
   - 예: `https://your-api-domain.com/api/openai-asset-report`
4. 서버리스에서 `CORS_ORIGIN`을 GitHub Pages 도메인으로 제한 권장

## 입력 파일
- 기존 프로젝트의 자산 엑셀 Export 파일(`.xlsx`)을 권장
- `Assets` 시트와 `Dashboard` 시트가 있으면 가장 정확하게 로딩됩니다.

## 관련 문서
- `JSON-Asset-Importer-Excel-Edit-Plan.md`
