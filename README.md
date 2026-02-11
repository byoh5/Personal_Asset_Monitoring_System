# GitHub Pages용 Asset Monitoring Viewer

정적 웹 페이지로 동작하는 조회 전용 버전입니다.

## 기능
- 엑셀 파일 업로드 후 `대시보드`, `자산` 화면 조회
- 다크/라이트 테마 토글
- 서버/DB 없이 브라우저에서만 동작

## 실행
`web_github_pages/index.html`을 브라우저로 열면 됩니다.

## GitHub Pages 배포
1. 저장소에 `web_github_pages` 폴더를 커밋
2. GitHub Pages Source를 해당 브랜치로 설정
3. 배포 루트를 `/web_github_pages`로 맞추거나, 루트 배포 시 폴더 내용을 루트로 복사

## 입력 파일
- 기존 프로젝트의 자산 엑셀 Export 파일(`.xlsx`)을 권장
- `Assets` 시트와 `Dashboard` 시트가 있으면 가장 정확하게 로딩됩니다.
