# 실뷰 프로젝트

- 작업 경로: `C:\Users\김종진\Desktop\vibecoding\silview`
- 웹: https://silview.choshg.com/
- 저장소: https://github.com/kjj0708-ai/silview
- 화면: React, TypeScript, Vite, Fabric.js
- Windows 앱: Electron 44.5.0, electron-builder 26.15.3, NSIS x64

## 현재 작업 — 2026-09-30

Windows 설치형 1.0.0을 추가했습니다. 탐색기 더블클릭/앱 안의 이미지 열기에서 해당 파일이 있는 폴더의 이미지 목록을 자동으로 읽습니다. 웹/PWA의 폴더 연결 방식을 설치형에 적용하지 않습니다.

100% 화면 맞춤, 다음 이미지 배율 유지, 편집 기능과 기존 웹 화면을 보존했습니다. 한 창 재사용, Windows 기본 앱 등록, 실뷰 파일 아이콘, 원본 보호 저장을 추가했습니다.

## 검증과 전달

- `npm run lint`, 파일 목록 단위 테스트, 웹/설치형 빌드.
- 실제 Electron 창에서 단일 파일/앱 내부 열기, 세로 화면 맞춤, 140% 유지, 원본 복사/편집 PNG 저장, 원본 덮어쓰기 거부, 두 번째 실행 처리 테스트.
- 설치 파일에 담긴 ASAR 리소스로도 위 8개 기능 테스트를 통과했습니다.
- 설치 산출물: `release/실뷰-Setup-1.0.0.exe`.
- 현재 코드 서명 없음. 사용자 PC에 설치하거나 기본 앱을 강제로 바꾸지 않았습니다.
- Windows 화면 자동 점검은 도구 승인 시간 초과로 완료하지 못했습니다. 실제 OS 설치 후 연결 프로그램/아이콘 확인은 사용자 설치 과정에서 확인해야 합니다.
- 상세페이지: https://silview.choshg.com/promo.html — 웹/Windows 선택 메뉴, 설치 및 기본 앱 설정, 앱 메뉴 설명.
- 설치 파일 공개 경로: https://dl.choshg.com/silview/silview-setup-1.0.0.exe (R2 `silcap-downloads/silview/`).
- 공개 파일은 테스트를 통과한 기존 1.0.0 파일을 그대로 사용합니다. 상세페이지/다운로드 버전과 SHA-256을 함께 검사합니다.

## 다음 작업 시

기능 수정 때 버전·설치 파일명·공개 다운로드 링크를 함께 올립니다. 원본 파일은 보존하며, 테스트/환경 비밀 파일은 패키징에서 제외합니다. 실행/검증 명령은 README.md에 있습니다.
