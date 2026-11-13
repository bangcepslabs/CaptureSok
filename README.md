# 캡처쏙 CaptureSok

브라우저의 영역, 요소, 보이는 화면과 전체 페이지를 캡처하고 이미지에 텍스트, 도형, 펜, 모자이크를 추가하는 Chrome 확장 프로그램입니다. 이미지는 기기에서 처리합니다.

## 설치와 사용

저장소를 다운로드하거나 `npm run package`로 ZIP을 생성한 후 압축을 풉니다. Chrome의 `chrome://extensions`에서 개발자 모드를 켜고 **압축해제된 확장 프로그램을 로드합니다**를 선택해 `manifest.json`이 있는 폴더를 지정합니다. Chrome 120 이상이 필요합니다.

Windows 기본 단축키는 영역 `Alt+1`, 요소 `Alt+2`, 전체 페이지 `Alt+3`, 보이는 화면 `Alt+4`입니다. 확장 프로그램 설정에서 Chrome의 단축키 설정 화면으로 이동해 변경할 수 있습니다.

편집 창에서 텍스트, 사각형, 원, 선, 화살표, 펜, 모자이크 및 자르기를 사용할 수 있습니다. 이미지는 PNG 또는 JPG로 저장하거나 클립보드에 복사할 수 있습니다.

## 개인정보와 권한

이미지와 설정은 로컬에서 처리하며 개발자 서버로 업로드하지 않습니다. `activeTab`과 `scripting`은 사용자가 요청한 캡처, `storage`는 설정과 임시 작업 상태, `downloads`는 이미지 저장에 사용합니다. 캡처에는 웹페이지에 표시된 민감한 정보가 포함될 수 있습니다.

[개인정보 처리방침](https://bangcepslabs.github.io/CaptureSok/docs/privacy.html) · 문의: bum2432@gmail.com

## 개발

```text
npm install
npx playwright install chromium
npm run check
npm test
npm run package
```

출시용 ZIP은 `dist/`에 생성됩니다. Chrome 내부 페이지와 웹 스토어는 캡처가 제한됩니다. iframe 내부, 별도 스크롤 영역과 동적으로 변하는 페이지는 전체 캡처가 완전하지 않을 수 있습니다.
