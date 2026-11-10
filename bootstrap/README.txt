너굴라이언트 고정 다운로드 파일 (설치 도우미)
================================================

유저에게 나눠 주는 파일 = "너굴라이언트 설치.exe" (빌드 결과 이름은 Nugulient-Download.exe)
  · 파일 이름은 마음대로 바꿔도 돼요. 이름은 윈도우 평판(해시)에 영향이 없어요.
GitHub 릴리스의 Nugulient-Setup.exe = 진짜 설치 파일 (electron-builder 가 만드는 것)

★ 절대 다시 컴파일하지 마세요 ★
-----------------------------------
Windows SmartScreen("Windows의 PC 보호") 평판은 "파일 내용(해시)" 단위로 쌓여요.
이 exe 를 다시 만들면 해시가 바뀌고, 그동안 쌓인 평판이 전부 사라져요.

이 안에는 버전 정보가 하나도 없고 주소도 "latest" 뿐이라,
너굴라이언트를 아무리 새로 배포해도 이 파일은 그대로 두면 돼요.
  sha256 b229e8eb7125cd350456e94ed061648ece4902fd4aafaaa5f3ee84d14c1c43cf

하는 일 (Nova Client 부트스트랩과 같은 동작, 화면만 너굴마을 구성)
-------
1) GitHub 최신 릴리스의 latest.yml 을 받아 크기 · 버전을 알아냄
2) 최신 Nugulient-Setup.exe 를 받으면서 나무 테두리 초록 진행 바 + "42% · 30 / 72 MB" 표시
3) 받은 설치 파일을 조용히(/S) 실행 → 윈도우 설치 마법사 없이 끝남
4) 설치가 끝나면 너굴라이언트를 바로 실행
프로그램이 받은 파일에는 인터넷 표식이 안 붙어서, 진짜 설치 파일을 실행할 땐
경고가 안 떠요. 브라우저로 직접 받는 건 이 파일 하나뿐이라 평판도 여기에만 쌓여요.

화면: 960x600, 나무 프레임 + 크림 패널 + "너굴라이언트" 나무 간판(Galmuri11 Bold),
      가운데 너굴마을 로고, 진행 바, 오른쪽 픽셀아트 사과나무(tree.py), 아래 잔디. 창은 끌어서 옮길 수 있고 최소화/닫기(확인) 있음.

필요한 것
---------
GitHub 저장소 Sil2ntium7012/nugulient 에 릴리스가 있고, 거기에
Nugulient-Setup.exe 와 latest.yml 이 들어 있어야 해요.
(package.json 버전 올리고 v1.0.1 같은 태그를 push → Actions 가 자동으로 올림)
릴리스 에셋 이름(Nugulient-Setup.exe)은 절대 바꾸지 마세요.

다시 만들어야만 하는 경우
------------------------
- GitHub 저장소 주소가 바뀔 때 / 릴리스 에셋 이름이 바뀔 때 → bootstrap.nsi 의 SETUP_URL 등 고치기
빌드: Galmuri 폰트(npm 패키지 galmuri 의 dist/Galmuri11-Bold.ttf)를 이 폴더에 두고
      python3 makebg.py  →  makensis bootstrap.nsi
