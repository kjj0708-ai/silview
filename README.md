# 실뷰 (SilView)

광고 없는 이미지 뷰어와 간편 편집 도구입니다. 기존 웹/PWA 화면을 유지하면서 Windows 설치형을 함께 제공합니다.

## Windows 설치형 1.0.0

설치 파일: `release/실뷰-Setup-1.0.0.exe` (Windows x64)

1. 설치 파일을 실행해 실뷰를 설치합니다.
2. 탐색기에서 이미지 우클릭 → **연결 프로그램 → 다른 앱 선택 → 실뷰 → 항상**을 선택합니다. PNG/JPG 등 기본 앱 연결은 파일 형식별로 선택합니다.
3. 이미지 하나를 열면 같은 폴더의 지원 이미지가 자동으로 표시됩니다. ←/→ 키나 이전/다음 버튼으로 넘깁니다. 폴더 업로드나 연결 권한 설정은 필요 없습니다.

앱 안의 **이미지 열기**도 같은 방식으로 동작합니다. `Ctrl+O`는 이미지, `Ctrl+Shift+O`는 폴더를 엽니다. 앱이 실행 중일 때 다른 이미지를 열어도 기존 창에서 전환합니다.

- 지원 형식: JPG, JPEG, JFIF, PNG, GIF, WebP, BMP, AVIF, SVG, ICO. HEIC/TIFF 지원은 포함하지 않습니다.
- 100%는 이미지 전체가 화면 안에 들어오는 크기입니다. 조정한 확대/축소 배율은 다음 이미지에도 유지합니다.
- 원본 읽기와 편집은 PC에서 처리합니다. 파일을 서버에 업로드하지 않습니다. 홍보 링크/RSS는 인터넷 연결을 사용합니다.
- 저장은 Windows 저장 창을 사용하며, 열었던 원본 경로로의 저장을 거부합니다. 전체 저장은 기존 파일과 이름이 겹치면 번호를 붙입니다.
- 기본 앱은 사용자가 Windows에서 선택합니다. 설치 프로그램은 지원 형식과 실뷰 아이콘을 등록하지만 Windows의 `UserChoice`를 강제로 변경하지 않습니다.
- 현재 설치 파일은 코드 서명되지 않았습니다. Windows에서 게시자 확인 경고가 표시될 수 있습니다.

상세페이지: https://silview.choshg.com/promo.html

공개 설치 파일: https://dl.choshg.com/silview/silview-setup-1.0.0.exe

## 개발 및 검증

Node.js와 npm이 필요합니다.

```powershell
npm install
npm run desktop          # 로컬 Windows 앱 실행
npm run lint             # TypeScript 검사
npm run test:desktop     # 파일 목록/정렬/안전한 저장 이름 테스트
npm run test:desktop-ui  # 실제 Electron 창의 열기/배율/편집/저장/재실행 테스트
npm run package:desktop  # 버전이 붙은 NSIS 설치 파일 생성
node --test scripts/promo.test.cjs  # 상세페이지 버전/링크/체크섬 검사
node scripts/verify-download.mjs   # 공개 설치 파일 전체 바이트와 SHA-256 비교
```

설치형 화면은 `dist-desktop`, 설치 산출물은 `release`에 생성됩니다. 패키지에는 비밀 환경 파일, 테스트 코드, 개발용 서버 및 웹 런타임 의존성을 포함하지 않습니다. `desktop/main.cjs`만 로컬 파일에 접근하며 화면에는 제한된 기능만 제공합니다.

빌드한 ASAR 리소스도 UI 테스트할 수 있습니다.

```powershell
$env:SILVIEW_PACKAGED_ROOT = (Resolve-Path 'release/win-unpacked/resources/app.asar').Path
npm run test:desktop-ui
Remove-Item Env:SILVIEW_PACKAGED_ROOT
```

## 웹/PWA

웹 주소: https://silview.choshg.com/

```powershell
npm run dev
npm run build
```

웹 버전은 브라우저 보안 때문에 폴더 연결 절차가 필요합니다. 설치형의 로컬 파일 접근과는 별도입니다. `main` 브랜치 푸시 시 기존 GitHub Actions 웹 배포가 실행되며, Windows 설치 파일 배포는 별도로 진행합니다.
