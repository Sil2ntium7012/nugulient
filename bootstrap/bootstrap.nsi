; ============================================================================
; 너굴라이언트 고정 부트스트랩  ->  너굴라이언트 설치.exe
; (Nova Client 부트스트랩을 너굴마을 화면 구성으로 바꾼 것 - 동작은 같음)
;
; 왜 이게 있나:
;   Windows SmartScreen 평판은 "파일 해시" 단위로 쌓인다. 런처를 새로 배포할 때마다
;   설치 파일 내용이 바뀌면 해시가 바뀌고 평판이 매번 0으로 초기화된다. 그래서
;   유저가 브라우저로 직접 받는 파일은 이 부트스트랩 하나로 고정하고, 진짜 설치
;   파일은 이 프로그램이 대신 받아서 조용히(/S) 실행한다.
;
; ★ 이 안에는 버전 정보가 하나도 없다. 주소도 "latest" 뿐이라 런처를 아무리 새로
;   배포해도 이 exe는 다시 만들 필요가 없고, 해시가 영원히 같다 -> 평판이 계속
;   누적된다. 절대 다시 컴파일하지 말 것.
;
;
; 너굴라이언트판 (2026-11-10):
;   · 화면: 나무 프레임 + 크림 패널 + "너굴라이언트" 나무 간판 + 가운데 너굴마을 로고
;     + 나무 테두리 초록 진행 바 + 사과나무 · 잔디 (bg.bmp, makebg.py 가 만듦)
;   · 노바판의 벽시계는 뺐다. 진행 상황은 진행 바와 "42%  ·  30 / 72 MB" 글자로 보여준다.
;   · 창 끌기 / 최소화 / 닫기 확인은 노바판 그대로.
;
; 흐름:
;   1) latest.yml 을 받아 설치 파일 크기를 알아낸다(진행률 계산용)
;   2) curl.exe 를 창 없이 띄워 설치 파일을 받고, 받는 동안 파일 크기를 재서 진행률 표시
;      (curl 이 없거나 실행 실패면 urlmon 으로 동기 다운로드 - 진행률 없이 통으로)
;   3) 받은 설치 파일을 /S 로 실행 (화면에 안 뜸)
;   4) 잠깐 "설치가 끝났어요"를 보여주고 종료. 임시 파일은 NSIS 가 알아서 지운다
; ============================================================================

Unicode true
SetCompressor /SOLID lzma

!include nsDialogs.nsh
!include LogicLib.nsh
!include WinMessages.nsh
!include FileFunc.nsh
!include x64.nsh
!include StrFunc.nsh
${StrLoc}

Name "너굴라이언트"
Caption "너굴라이언트"
OutFile "Nugulient-Download.exe"
Icon "icon.ico"
RequestExecutionLevel user
XPStyle on
BrandingText " "
ShowInstDetails nevershow

VIProductVersion "1.0.0.0"
VIAddVersionKey "ProductName"     "너굴라이언트"
VIAddVersionKey "FileDescription" "너굴라이언트 설치 도우미"
VIAddVersionKey "CompanyName"     "망고"
VIAddVersionKey "LegalCopyright"  "망고"
VIAddVersionKey "FileVersion"     "1.0.0.0"
VIAddVersionKey "ProductVersion"  "1.0.0.0"

!define SETUP_URL    "https://github.com/Sil2ntium7012/nugulient/releases/latest/download/Nugulient-Setup.exe"
!define YML_URL      "https://github.com/Sil2ntium7012/nugulient/releases/latest/download/latest.yml"
!define RELEASES_URL "https://github.com/Sil2ntium7012/nugulient/releases/latest"

!define WIN_W 960
!define WIN_H 600

; 창 스타일: WS_POPUP|WS_VISIBLE|WS_CLIPCHILDREN|WS_SYSMENU|WS_MINIMIZEBOX
; 24-129차: WS_SYSMENU/WS_MINIMIZEBOX 가 없으면 윈도우가 이 창을 "최소화할 수 있는 창"으로
; 보지 않아서 최소화 애니메이션이 안 나온다. WS_CAPTION 은 여전히 없으므로 제목표시줄은 안 생김
!define NOVA_STYLE 0x920A0000

; 색 (SetCtlColors 는 0xRRGGBB)
; ⚠️ C_BG 는 창 전체 색이자 "모든 라벨의 배경색"이다. makebg.py 의 BG 와 반드시 같아야 한다
!define C_BG      0xEFE5CF   ; 크림 패널 (makebg.py 의 BG)
!define C_TEXT    0x4A2E1F   ; 상태 문구 (진한 갈색)
!define C_X       0x8A5A3B   ; 창 버튼 글자 (나무색)
!define C_VER     0x9C7F62   ; 버전 글씨

; 진행 바 (makebg.py 의 BAR_* 와 반드시 일치) - 채움 영역 좌표
!define BAR_X 284
!define BAR_Y 388
!define BAR_W 392
!define BAR_H 12
!define C_BAR 0x6FAE4F       ; 너굴 초록

!define SS_CENTER_  0x00000001
!define SS_RIGHT_   0x00000002
!define SS_NOTIFY_  0x00000100

!ifndef STM_SETIMAGE
  !define STM_SETIMAGE 0x0172
!endif
!ifndef WM_NCLBUTTONDOWN
  !define WM_NCLBUTTONDOWN 0x00A1
!endif
!define SC_MINIMIZE 0xF020
!define HTCAPTION 2

Var Dlg
Var ImgBg
Var ImgHandle
Var LblStatus
Var LblX
Var LblMin
Var LblVer
Var Version
Var StatusBase  ; 상태 문구 본문(뒤에 "78 / 126 MB" 같은 꼬리가 붙음)
Var StatusTail
Var SetupPath
Var YmlPath
Var TotalBytes
Var ProcHandle
Var Phase
Var UsedFallback
Var LogFile
Var Ticks
Var LastSize
Var Diag

Var BarFill       ; 진행 바 초록 채움
Var Dragging

; 24-130차: 다운로드가 왜 안 되는지 눈으로 확인할 수 있게 로그를 남긴다.
; %TEMP%\nugulient-bootstrap.log 에 단계별 결과와 오류 코드를 적는다.
Function Log
  Exch $R0
  Push $R1
  ClearErrors
  FileOpen $R1 "$LogFile" a
  IfErrors log_done
  FileSeek $R1 0 END
  FileWrite $R1 "$R0$\r$\n"
  FileClose $R1
  log_done:
  Pop $R1
  Pop $R0
FunctionEnd

!macro LOG text
  Push "${text}"
  Call Log
!macroend
!define LOG "!insertmacro LOG"

Page custom PageMain

; ---------------------------------------------------------------------------
; 창 자체를 테두리 없는 960x600 으로 바꾸고 화면 가운데에 놓는다
; ---------------------------------------------------------------------------
Function .onGUIInit
  System::Call 'user32::SetWindowLongW(p $HWNDPARENT, i -16, i ${NOVA_STYLE})'
  ; 테두리를 없애면 작업표시줄에서 빠진다 -> WS_EX_APPWINDOW(0x40000)를 켠다
  System::Call 'user32::GetWindowLongW(p $HWNDPARENT, i -20) i .r4'
  IntOp $4 $4 | 0x40000
  System::Call 'user32::SetWindowLongW(p $HWNDPARENT, i -20, i r4)'

  ; 24-170차: WS_EX_APPWINDOW 는 "다음에 창을 보여줄 때" 읽히는 값이라, 이미 보이는
  ; 창에 켜봐야 작업표시줄 단추가 안 생긴다. 그래서 최소화하면 창이 사라지고 되돌릴
  ; 방법이 없었다("최소화 눌러도 꺼지고"). 보이는 상태면 한 번 숨겼다 다시 보여준다.
  System::Call 'user32::IsWindowVisible(p $HWNDPARENT) i .r5'
  ${If} $5 != 0
    System::Call 'user32::ShowWindow(p $HWNDPARENT, i 0)'
    System::Call 'user32::ShowWindow(p $HWNDPARENT, i 5)'
  ${EndIf}

  System::Call 'user32::GetSystemMetrics(i 0) i .r0'
  System::Call 'user32::GetSystemMetrics(i 1) i .r1'
  IntOp $2 $0 - ${WIN_W}
  IntOp $2 $2 / 2
  IntOp $3 $1 - ${WIN_H}
  IntOp $3 $3 / 2
  ; SWP_FRAMECHANGED(0x20)|SWP_NOZORDER(0x4)|SWP_NOACTIVATE(0x10)
  System::Call 'user32::SetWindowPos(p $HWNDPARENT, p 0, i r2, i r3, i ${WIN_W}, i ${WIN_H}, i 0x34)'
FunctionEnd

; ---------------------------------------------------------------------------
; 화면
; ---------------------------------------------------------------------------
Function PageMain
  ; 기본 마법사 버튼/구분선 숨기기
  GetDlgItem $0 $HWNDPARENT 1
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 2
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 3
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1256
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1028
  ShowWindow $0 ${SW_HIDE}
  GetDlgItem $0 $HWNDPARENT 1035
  ShowWindow $0 ${SW_HIDE}

  ; 창 크기/위치를 한 번 더 확정 (가운데 정렬)
  System::Call 'user32::GetSystemMetrics(i 0) i .r0'
  System::Call 'user32::GetSystemMetrics(i 1) i .r1'
  IntOp $2 $0 - ${WIN_W}
  IntOp $2 $2 / 2
  IntOp $3 $1 - ${WIN_H}
  IntOp $3 $3 / 2
  System::Call 'user32::SetWindowPos(p $HWNDPARENT, p 0, i r2, i r3, i ${WIN_W}, i ${WIN_H}, i 0x34)'

  StrCpy $LogFile "$TEMP\nugulient-bootstrap.log"
  Delete "$LogFile"
  ${LOG} "=== 너굴라이언트 설치 도우미 시작 ==="

  InitPluginsDir
  File "/oname=$PLUGINSDIR\bg.bmp" "bg.bmp"

  nsDialogs::Create 1018
  Pop $Dlg
  ${If} $Dlg == error
    Abort
  ${EndIf}

  ; 안쪽 대화상자를 창 전체로
  System::Call 'user32::SetWindowPos(p $Dlg, p 0, i 0, i 0, i ${WIN_W}, i ${WIN_H}, i 0x14)'
  SetCtlColors $Dlg ${C_TEXT} ${C_BG}

  ; 우주 배경
  ${NSD_CreateBitmap} 0 0 ${WIN_W} ${WIN_H} ""
  Pop $ImgBg
  ${NSD_SetImage} $ImgBg "$PLUGINSDIR\bg.bmp" $ImgHandle

  ; 24-128차: 라벨 배경을 transparent 로 두면 이미지가 아니라 "대화상자 배경색"이 비쳐서
  ; 글자 뒤에 네모가 생긴다. 24-166차부터는 창 전체가 같은 단색(C_BG)이라, 모든 라벨이
  ; 그냥 C_BG 를 배경색으로 쓰면 경계가 아예 존재하지 않는다.

  ; 위쪽 띠 오른쪽: 최소화 / 닫기
  nsDialogs::CreateControl STATIC ${DEFAULT_STYLES}|${SS_CENTER_}|${SS_NOTIFY_} 0 852 26 40 28 "—"
  Pop $LblMin
  SetCtlColors $LblMin ${C_X} ${C_BG}
  CreateFont $1 "Segoe UI" 14 400
  SendMessage $LblMin ${WM_SETFONT} $1 1
  ${NSD_OnClick} $LblMin OnMinClick

  nsDialogs::CreateControl STATIC ${DEFAULT_STYLES}|${SS_CENTER_}|${SS_NOTIFY_} 0 894 26 40 28 "✕"
  Pop $LblX
  SetCtlColors $LblX ${C_X} ${C_BG}
  SendMessage $LblX ${WM_SETFONT} $1 1
  ${NSD_OnClick} $LblX OnCloseClick

  ; 이름 아래: 받으려는 버전 - latest.yml 을 읽은 뒤 ReadTotalSize 가 채운다
  nsDialogs::CreateControl STATIC ${DEFAULT_STYLES}|${SS_CENTER_} 0 400 470 160 16 ""
  Pop $LblVer
  SetCtlColors $LblVer ${C_VER} ${C_BG}
  CreateFont $4 "Malgun Gothic" 9 700
  SendMessage $LblVer ${WM_SETFONT} $4 1

  ; 시계 아래: 상태 문구 (가운데 정렬)
  nsDialogs::CreateControl STATIC ${DEFAULT_STYLES}|${SS_CENTER_} 0 240 346 480 24 "설치를 준비하고 있어요"
  Pop $LblStatus
  SetCtlColors $LblStatus ${C_TEXT} ${C_BG}
  StrCpy $StatusBase "설치를 준비하고 있어요"
  StrCpy $StatusTail ""
  CreateFont $2 "Malgun Gothic" 12 700
  SendMessage $LblStatus ${WM_SETFONT} $2 1

  ; ── 진행 바 (나무 테두리는 bg.bmp 에 그려져 있고, 초록 채움만 여기서 늘린다) ──
  nsDialogs::CreateControl STATIC ${DEFAULT_STYLES} 0 ${BAR_X} ${BAR_Y} 0 ${BAR_H} ""
  Pop $BarFill
  SetCtlColors $BarFill ${C_BAR} ${C_BAR}

  ; 배경 이미지를 맨 뒤로 (HWND_BOTTOM=1, NOSIZE|NOMOVE|NOACTIVATE=0x13)
  System::Call 'user32::SetWindowPos(p $ImgBg, p 1, i 0, i 0, i 0, i 0, i 0x13)'

  StrCpy $Phase 0
  StrCpy $Dragging 0
  ${NSD_CreateTimer} OnTick 400
  ; 창 끌기 감지
  ${NSD_CreateTimer} OnUiTick 50

  nsDialogs::Show
  ${NSD_KillTimer} OnUiTick
  ${NSD_FreeImage} $ImgHandle
FunctionEnd

; 24-129차: 타이머/클릭 콜백 안에서 부른 Quit 은 즉시 먹지 않는다. nsDialogs::Show 가
; 아직 메시지 루프를 돌고 있어서, Quit 이 세워둔 플래그가 처리될 기회가 없기 때문.
; (X 버튼이 눌러도 아무 반응이 없던 원인) 창에 닫기 메시지를 보내 확실히 끝낸다.
Function CloseApp
  ${NSD_KillTimer} OnTick
  ${NSD_KillTimer} OnUiTick
  ${If} $ProcHandle != 0
    System::Call 'kernel32::TerminateProcess(p $ProcHandle, i 1)'
    System::Call 'kernel32::CloseHandle(p $ProcHandle)'
    StrCpy $ProcHandle 0
  ${EndIf}
  SendMessage $HWNDPARENT ${WM_CLOSE} 0 0
FunctionEnd

; Abort 를 부르지 않으면 기본 "정말 종료할까요?" 확인 없이 그대로 종료된다
Function .onUserAbort
FunctionEnd

; 24-170차: ShowWindow(SW_MINIMIZE) 대신 시스템 명령으로 보낸다. 그래야 윈도우가
; "창을 최소화한다"는 일을 직접 처리해서 작업표시줄로 빨려 들어가는 애니메이션이 나온다
Function OnMinClick
  Pop $0
  SendMessage $HWNDPARENT ${WM_SYSCOMMAND} ${SC_MINIMIZE} 0
FunctionEnd

; 24-170차: "X 눌렀을 때 확인 메시지도 좀 주고"
Function OnCloseClick
  Pop $0
  ${If} $Phase >= 2
    ; 설치가 이미 시작된 뒤엔 중간에 끊으면 더 곤란해진다
    MessageBox MB_OK|MB_ICONINFORMATION "설치를 마무리하는 중이에요.$\r$\n잠시만 기다려주세요."
    Return
  ${EndIf}
  MessageBox MB_YESNO|MB_ICONQUESTION "너굴라이언트 설치를 취소할까요?$\r$\n$\r$\n받던 파일은 지워지고 설치는 진행되지 않아요." IDYES do_close
  Return
  do_close:
  Call CloseApp
FunctionEnd

; ---------------------------------------------------------------------------
; 50ms 마다: 시계 갱신 + 창 끌기
;
; 24-170차: "그 앱이 안움직여 화면에서 끌어도"
;   제목표시줄이 없는 창이라 윈도우가 "여기를 잡으면 창이 움직인다"는 걸 모른다.
;   보통은 창 procedure 를 가로채서 WM_NCHITTEST 에 HTCAPTION 을 돌려주지만, NSIS 에서
;   창 procedure 를 바꾸는 건 위험하다. 대신 왼쪽 버튼이 눌린 채로 우리 창 위에 있으면
;   그때 WM_NCLBUTTONDOWN(HTCAPTION)을 보내준다 - 윈도우가 그 자리에서 기본 "창 옮기기"
;   루프로 들어가서, 버튼을 뗄 때까지 창이 마우스를 따라온다.
; ---------------------------------------------------------------------------
Function OnUiTick
  ${If} $Dragging == 1
    Return
  ${EndIf}

  System::Call 'user32::GetAsyncKeyState(i 1) i .r0'
  IntOp $0 $0 & 0x8000
  ${If} $0 == 0
    Return
  ${EndIf}
  ; 다른 창을 쓰는 중이면 끼어들지 않는다
  System::Call 'user32::GetForegroundWindow() p .r1'
  ${If} $1 != $HWNDPARENT
    Return
  ${EndIf}

  System::Call '*(i, i) p .r2'
  System::Call 'user32::GetCursorPos(p $2)'
  System::Call '*$2(i .r3, i .r4)'
  System::Free $2
  System::Call '*(i, i, i, i) p .r2'
  System::Call 'user32::GetWindowRect(p $HWNDPARENT, p $2)'
  System::Call '*$2(i .r5, i .r6, i, i)'
  System::Free $2

  IntOp $7 $3 - $5      ; 창 안에서의 x
  IntOp $8 $4 - $6      ; 창 안에서의 y
  ${If} $7 < 0
  ${OrIf} $8 < 0
  ${OrIf} $7 >= ${WIN_W}
  ${OrIf} $8 >= ${WIN_H}
    Return
  ${EndIf}
  ; 오른쪽 위 창 버튼 자리에서는 끌지 않는다(눌러야 하니까)
  ${If} $8 < 52
  ${AndIf} $7 > 848
    Return
  ${EndIf}

  StrCpy $Dragging 1
  System::Call 'user32::ReleaseCapture()'
  ; 여기서 윈도우가 자기 루프로 들어가고, 버튼을 뗄 때까지 안 돌아온다
  SendMessage $HWNDPARENT ${WM_NCLBUTTONDOWN} ${HTCAPTION} 0
  StrCpy $Dragging 0
FunctionEnd

; 24-163차: 상태 칩은 "본문 · 꼬리(78 / 126 MB)" 형태로 합쳐서 보여준다.
Function RefreshStatus
  ${If} $StatusTail == ""
    SendMessage $LblStatus ${WM_SETTEXT} 0 "STR:$StatusBase"
  ${Else}
    SendMessage $LblStatus ${WM_SETTEXT} 0 "STR:$StatusBase  ·  $StatusTail"
  ${EndIf}
FunctionEnd

Function SetStatus
  Exch $0
  StrCpy $StatusBase $0
  Call RefreshStatus
  Pop $0
FunctionEnd

Function SetStatusTail
  Exch $0
  StrCpy $StatusTail $0
  Call RefreshStatus
  Pop $0
FunctionEnd

!macro Status text
  Push "${text}"
  Call SetStatus
!macroend
!define Status "!insertmacro Status"

; 앞뒤 공백/줄바꿈 제거
Function TrimLine
  Exch $R0
  Push $R1
  tl_lead:
    StrCpy $R1 $R0 1
    ${If} $R1 == " "
    ${OrIf} $R1 == "$\t"
      StrCpy $R0 $R0 "" 1
      Goto tl_lead
    ${EndIf}
  tl_tail:
    StrCpy $R1 $R0 1 -1
    ${If} $R1 == "$\r"
    ${OrIf} $R1 == "$\n"
    ${OrIf} $R1 == " "
    ${OrIf} $R1 == "$\t"
      StrCpy $R0 $R0 -1
      Goto tl_tail
    ${EndIf}
  Pop $R1
  Exch $R0
FunctionEnd

; ---------------------------------------------------------------------------
; 진행
; ---------------------------------------------------------------------------
Function OnTick
  ${If} $Phase == 0
    ${NSD_KillTimer} OnTick
    StrCpy $Phase 1
    Call StartDownload
    ${NSD_CreateTimer} OnTick 250
    Return
  ${EndIf}

  ${If} $Phase == 1
    Call PollDownload
    Return
  ${EndIf}
FunctionEnd

; latest.yml 에서 설치 파일 크기와 버전을 읽어 둔다(진행률 계산 / 아래쪽 버전 표시).
; 실패해도 그냥 진행한다 - 버전은 안 보이고 진행률만 MB 단위로 표시됨
Function ReadTotalSize
  StrCpy $TotalBytes 0
  StrCpy $Version ""
  StrCpy $YmlPath "$PLUGINSDIR\latest.yml"
  System::Call 'kernel32::GetTickCount()i.r1'
  StrCpy $2 "${YML_URL}?cb=$1"
  System::Call 'urlmon::URLDownloadToFileW(i 0, t r2, t "$YmlPath", i 0, i 0) i .r3'
  ${If} $3 != 0
    Return
  ${EndIf}
  ClearErrors
  FileOpen $4 "$YmlPath" r
  ${If} ${Errors}
    Return
  ${EndIf}
  loop:
    FileRead $4 $5
    ${If} ${Errors}
      Goto done
    ${EndIf}
    ; version: 1.0.1   (줄 맨 앞에서 시작하는 것만)
    ${If} $Version == ""
      StrCpy $6 $5 8
      ${If} $6 == "version:"
        StrCpy $8 $5 "" 8
        Push $8
        Call TrimLine
        Pop $Version
      ${EndIf}
    ${EndIf}
    ; size: 12345678   (files 아래 첫 번째 것)
    ${If} $TotalBytes == 0
      ${StrLoc} $6 $5 "size:" ">"
      ${If} $6 != ""
        IntOp $7 $6 + 5
        StrCpy $8 $5 "" $7
        Push $8
        Call TrimLine
        Pop $8
        StrCpy $TotalBytes $8
        IntOp $TotalBytes $TotalBytes + 0
      ${EndIf}
    ${EndIf}
    ${If} $TotalBytes != 0
    ${AndIf} $Version != ""
      Goto done
    ${EndIf}
    Goto loop
  done:
  FileClose $4
  ${If} $Version != ""
    SendMessage $LblVer ${WM_SETTEXT} 0 "STR:v$Version"
  ${EndIf}
FunctionEnd

Function StartDownload
  ${Status} "설치 파일을 받고 있어요"
  StrCpy $SetupPath "$PLUGINSDIR\Nugulient-Install.exe"
  StrCpy $UsedFallback 0
  StrCpy $ProcHandle 0
  StrCpy $Ticks 0
  StrCpy $LastSize 0
  StrCpy $Diag ""

  Call ReadTotalSize
  ${LOG} "total=$TotalBytes"

  ; 32비트 설치 파일이라 64비트 윈도우에서는 $SYSDIR 가 SysWOW64 로 돌려진다(WOW64
  ; 파일 리다이렉션). curl.exe 는 진짜 System32 에만 있으므로 리다이렉션을 꺼야 보인다
  ${DisableX64FSRedirection}
  StrCpy $R5 "$SYSDIR\curl.exe"
  ${IfNot} ${FileExists} "$R5"
    ; Sysnative 로도 한 번 더 시도 (리다이렉션이 안 꺼졌을 때의 우회로)
    StrCpy $R5 "$WINDIR\Sysnative\curl.exe"
  ${EndIf}
  ${IfNot} ${FileExists} "$R5"
    StrCpy $R5 ""
  ${EndIf}
  ${LOG} "curl=$R5"

  ${If} $R5 != ""
    StrCpy $2 '"$R5" -L -sS --fail --retry 2 --max-time 3600 -o "$SetupPath" "${SETUP_URL}"'
    Push $2
    Call StartHidden
    Pop $R6
    ${LOG} "curl start=$R6 cmd=$2"
    ${If} $R6 != 0
      ${EnableX64FSRedirection}
      Return
    ${EndIf}
    StrCpy $Diag "curl 실행 실패"
  ${EndIf}

  ; 2차: PowerShell 로 같은 일을 시켜본다 (역시 창 없이)
  StrCpy $R5 "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"
  ${If} ${FileExists} "$R5"
    System::Call 'kernel32::GetTickCount()i.r1'
    StrCpy $2 '"$R5" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$$ProgressPreference=$\'SilentlyContinue$\'; Invoke-WebRequest -Uri $\'${SETUP_URL}$\' -OutFile $\'$SetupPath$\'"'
    Push $2
    Call StartHidden
    Pop $R6
    ${LOG} "ps start=$R6"
    ${If} $R6 != 0
      ${EnableX64FSRedirection}
      Return
    ${EndIf}
    StrCpy $Diag "$Diag / PowerShell 실행 실패"
  ${EndIf}
  ${EnableX64FSRedirection}

  ; 마지막: 창이 잠깐 멈추더라도 urlmon 으로 통째로 받는다
  StrCpy $UsedFallback 1
  ${LOG} "fallback=urlmon (curl/PowerShell 둘 다 실행 실패)"
  ${Status} "설치 파일을 받고 있어요 (잠시만 기다려주세요)"
  Push "받는 중..."
  Call SetStatusTail
  System::Call 'user32::UpdateWindow(p $HWNDPARENT)'
  System::Call 'kernel32::GetTickCount()i.r1'
  StrCpy $2 "${SETUP_URL}?cb=$1"
  System::Call 'urlmon::URLDownloadToFileW(i 0, t r2, t "$SetupPath", i 0, i 0) i .r3'
  ${LOG} "urlmon hr=$3"
FunctionEnd

; 파일 크기 재기. 스택: 경로 -> 크기 (열지 못하면 -1)
Function FileSizeOf
  Exch $R0
  Push $R1
  Push $R2
  StrCpy $R2 -1
  ClearErrors
  FileOpen $R1 "$R0" r
  ${IfNot} ${Errors}
    FileSeek $R1 0 END $R2
    FileClose $R1
  ${EndIf}
  StrCpy $R0 $R2
  Pop $R2
  Pop $R1
  Exch $R0
FunctionEnd

; 명령줄 하나를 "콘솔 창 없이" 비동기로 실행한다.
; 스택: 명령줄 -> (프로세스 핸들 또는 0)
; NSIS 의 Exec 은 콘솔 창이 뜨고, nsExec 은 끝날 때까지 기다려서 창이 멈춘다.
; 그래서 CreateProcess 를 CREATE_NO_WINDOW(0x08000000) 로 직접 부른다.
Function StartHidden
  Exch $R0            ; 명령줄
  Push $R1
  Push $R2
  Push $R3
  Push $R4

  System::Alloc 68
  Pop $R1             ; STARTUPINFOW (32비트에서 68바이트)
  System::Call "*$R1(i 68)"
  System::Alloc 16
  Pop $R2             ; PROCESS_INFORMATION

  System::Call 'kernel32::CreateProcessW(i 0, t R0, i 0, i 0, i 0, i 0x08000000, i 0, i 0, p R1, p R2) i .R3'
  ${If} $R3 == 0
    System::Call 'kernel32::GetLastError() i .R4'
    ${LOG} "CreateProcess 실패 err=$R4"
    StrCpy $R0 0
  ${Else}
    System::Call "*$R2(p .R4, p, i, i)"
    StrCpy $R0 $R4
    StrCpy $ProcHandle $R4
  ${EndIf}

  System::Free $R1
  System::Free $R2
  Pop $R4
  Pop $R3
  Pop $R2
  Pop $R1
  Exch $R0
FunctionEnd

Function PollDownload
  ${If} $UsedFallback == 1
    ${NSD_KillTimer} OnTick
    Call FinishDownload
    Return
  ${EndIf}

  IntOp $Ticks $Ticks + 1

  ; 받은 크기 확인 (파일을 직접 열어서 끝으로 seek - 정확함)
  StrCpy $R4 0
  ${If} ${FileExists} "$SetupPath"
    Push "$SetupPath"
    Call FileSizeOf
    Pop $R4
    ${If} $R4 < 0
      StrCpy $R4 0
      StrCpy $Diag "파일을 읽지 못함"
    ${EndIf}
  ${EndIf}
  StrCpy $LastSize $R4

  ; 1초마다 기록 (무슨 일이 일어나는지 로그로 남김)
  IntOp $R3 $Ticks % 4
  ${If} $R3 == 0
    ${LOG} "tick=$Ticks size=$R4"
  ${EndIf}

  ; 24-170차: 시계는 이제 진짜 시각을 가리키므로 진행 상황은 글자로만 알린다
  ${If} $TotalBytes > 0
    IntOp $5 $R4 / 1048576
    IntOp $6 $TotalBytes / 1048576
    ${If} $R4 < 1
      Push "연결하는 중..."
      Call SetStatusTail
    ${Else}
      ; 진행 바: (받은 KB * 바 폭) / 전체 KB  (32비트 넘침 방지로 KB 단위)
      IntOp $8 $R4 / 1024
      IntOp $9 $TotalBytes / 1024
      IntOp $8 $8 * ${BAR_W}
      IntOp $8 $8 / $9
      ${If} $8 > ${BAR_W}
        StrCpy $8 ${BAR_W}
      ${EndIf}
      Call SetBarWidth
      IntOp $9 $R4 / 1024
      IntOp $9 $9 * 100
      IntOp $R3 $TotalBytes / 1024
      IntOp $9 $9 / $R3
      Push "$9%  ·  $5 / $6 MB"
      Call SetStatusTail
    ${EndIf}
  ${Else}
    IntOp $5 $R4 / 1048576
    Push "$5 MB"
    Call SetStatusTail
  ${EndIf}

  ; 프로세스가 끝났는지 확인 (0 = 신호됨)
  System::Call 'kernel32::WaitForSingleObject(p $ProcHandle, i 0) i .r4'
  ${If} $4 == 0
    System::Call 'kernel32::GetExitCodeProcess(p $ProcHandle, *i .r7)'
    ${LOG} "다운로드 종료 code=$7 size=$LastSize"
    ${If} $7 != 0
      StrCpy $Diag "curl 오류 코드 $7"
    ${EndIf}
    System::Call 'kernel32::CloseHandle(p $ProcHandle)'
    StrCpy $ProcHandle 0
    ${NSD_KillTimer} OnTick
    Call FinishDownload
    Return
  ${EndIf}

  ; 24-131차: 예전 워치독은 4초만에 잘라버렸는데, GitHub 은 리다이렉트를 두 번 타느라
  ; 첫 바이트까지 몇 초 걸리는 게 정상이었다. 그래서 멀쩡히 받고 있는 걸 죽이고 urlmon
  ; 으로 넘어가 창이 통째로 멈췄음("응답 없음"). 이제는 아주 넉넉하게 90초 동안 단 1바이트도
  ; 안 들어왔을 때만 포기하고, urlmon 으로 갈아타지 않고 그냥 안내한다.
  ${If} $Ticks > 360
  ${AndIf} $R4 < 1
    ${LOG} "90초간 0바이트 - 포기"
    StrCpy $Diag "서버에서 응답이 없어요"
    ${NSD_KillTimer} OnTick
    ${If} $ProcHandle != 0
      System::Call 'kernel32::TerminateProcess(p $ProcHandle, i 1)'
      System::Call 'kernel32::CloseHandle(p $ProcHandle)'
      StrCpy $ProcHandle 0
    ${EndIf}
    Call FinishDownload
  ${EndIf}
FunctionEnd

; 24-132차: "설치 다 되면 자동실행해줘"
; 조용한 설치(/S)에서는 electron-builder 의 "설치 후 실행" 체크박스가 아예 없어서 앱이
; 저절로 뜨지 않는다. 그래서 부트스트랩이 직접 켠다.
; 설치 경로가 바뀔 수 있으니 exe -> 바탕화면 바로가기 -> 시작메뉴 바로가기 순으로 찾는다.
Function LaunchApp
  ${Status} "너굴라이언트를 실행하는 중이에요"

  StrCpy $R0 "$LOCALAPPDATA\Programs\너굴라이언트\너굴라이언트.exe"
  ${If} ${FileExists} "$R0"
    ${LOG} "실행: $R0"
    Exec '"$R0"'
    Return
  ${EndIf}

  StrCpy $R0 "$LOCALAPPDATA\Programs\nugulient\너굴라이언트.exe"
  ${If} ${FileExists} "$R0"
    ${LOG} "실행: $R0"
    Exec '"$R0"'
    Return
  ${EndIf}

  StrCpy $R0 "$DESKTOP\너굴라이언트.lnk"
  ${If} ${FileExists} "$R0"
    ${LOG} "실행(바탕화면 바로가기): $R0"
    ExecShell "" "$R0"
    Return
  ${EndIf}

  StrCpy $R0 "$SMPROGRAMS\너굴라이언트.lnk"
  ${If} ${FileExists} "$R0"
    ${LOG} "실행(시작메뉴 바로가기): $R0"
    ExecShell "" "$R0"
    Return
  ${EndIf}

  ${LOG} "자동 실행 실패 - 실행 파일을 찾지 못함"
FunctionEnd

; $8 = 채울 폭(px)
Function SetBarWidth
  System::Call 'user32::SetWindowPos(p $BarFill, p 0, i 0, i 0, i $8, i ${BAR_H}, i 0x16)'
  System::Call 'user32::InvalidateRect(p $BarFill, p 0, i 1)'
FunctionEnd

Function FinishDownload
  StrCpy $0 0
  ${If} ${FileExists} "$SetupPath"
    ${GetSize} "$PLUGINSDIR" "/M=Nugulient-Install.exe /S=0B /G=0" $0 $1 $2
  ${EndIf}
  ${If} $0 < 1000000
    ${LOG} "실패: 받은 크기=$0 diag=$Diag"
    MessageBox MB_OK|MB_ICONEXCLAMATION "설치 파일을 받지 못했어요.$\r$\n$\r$\n인터넷 연결을 확인한 뒤 다시 시도해주세요.$\r$\n계속 안 되면 다운로드 페이지에서 직접 받을 수 있어요.$\r$\n$\r$\n자세한 기록: $LogFile"
    ExecShell "open" "${RELEASES_URL}"
    Call CloseApp
    Return
  ${EndIf}

  StrCpy $Phase 2
  StrCpy $8 ${BAR_W}
  Call SetBarWidth
  Push ""
  Call SetStatusTail
  ${Status} "설치하는 중이에요"

  ; /S = 조용히 설치. 화면에 아무 창도 뜨지 않는다
  ${LOG} "설치 시작 (/S)"
  ExecWait '"$SetupPath" /S' $1
  ${LOG} "설치 종료 code=$1"
  ${If} $1 != 0
    ${Status} "설치 창을 여는 중이에요"
    ExecWait '"$SetupPath"'
  ${EndIf}

  StrCpy $Phase 3
  ${Status} "설치가 끝났어요"
  Call LaunchApp
  Sleep 700
  Call CloseApp
FunctionEnd

Section
SectionEnd
