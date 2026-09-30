; Register the viewer in Windows Default Apps without changing UserChoice.
!macro silviewSupportedExtension EXT
  WriteRegStr HKCU "Software\SilView\Capabilities\FileAssociations" ".${EXT}" "SilView.Image"
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\SupportedTypes" ".${EXT}" ""
!macroend

!macro customInstall
  WriteRegStr HKCU "Software\RegisteredApplications" "SilView" "Software\SilView\Capabilities"
  WriteRegStr HKCU "Software\SilView\Capabilities" "ApplicationName" "실뷰"
  WriteRegStr HKCU "Software\SilView\Capabilities" "ApplicationDescription" "실뷰 - 같은 폴더 자동 이어보기 이미지 뷰어"
  WriteRegStr HKCU "Software\SilView\Capabilities" "ApplicationIcon" '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\",0'
  WriteRegStr HKCU "Software\Classes\SilView.Image\Application" "ApplicationName" "실뷰"
  WriteRegStr HKCU "Software\Classes\SilView.Image\DefaultIcon" "" '$\"$INSTDIR\resources\silview.ico$\",0'
  WriteRegStr HKCU "Software\Classes\SilView.Image\shell\open\command" "" '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" $\"%1$\"'
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}" "FriendlyAppName" "실뷰"
  WriteRegStr HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}\shell\open\command" "" '$\"$INSTDIR\${APP_EXECUTABLE_FILENAME}$\" $\"%1$\"'
  !insertmacro silviewSupportedExtension "jpg"
  !insertmacro silviewSupportedExtension "jpeg"
  !insertmacro silviewSupportedExtension "jfif"
  !insertmacro silviewSupportedExtension "png"
  !insertmacro silviewSupportedExtension "gif"
  !insertmacro silviewSupportedExtension "webp"
  !insertmacro silviewSupportedExtension "bmp"
  !insertmacro silviewSupportedExtension "avif"
  !insertmacro silviewSupportedExtension "svg"
  !insertmacro silviewSupportedExtension "ico"
  !insertmacro UPDATEFILEASSOC
!macroend

!macro silviewRemoveExtension EXT
  ReadRegStr $0 HKCU "Software\Classes\.${EXT}" ""
  ${If} $0 == "SilView.Image"
    DeleteRegValue HKCU "Software\Classes\.${EXT}" ""
  ${EndIf}
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\RegisteredApplications" "SilView"
  DeleteRegKey HKCU "Software\SilView\Capabilities"
  DeleteRegKey HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"
  !insertmacro silviewRemoveExtension "jpg"
  !insertmacro silviewRemoveExtension "jpeg"
  !insertmacro silviewRemoveExtension "jfif"
  !insertmacro silviewRemoveExtension "png"
  !insertmacro silviewRemoveExtension "gif"
  !insertmacro silviewRemoveExtension "webp"
  !insertmacro silviewRemoveExtension "bmp"
  !insertmacro silviewRemoveExtension "avif"
  !insertmacro silviewRemoveExtension "svg"
  !insertmacro silviewRemoveExtension "ico"
!macroend
