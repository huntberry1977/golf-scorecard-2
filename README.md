# ⛳ 골프 스코어카드

PC에서 실행하고 스마트폰으로 접속하는 모바일 웹앱입니다.

## 설치 및 실행

```bash
# 1. 의존성 설치 (최초 1회)
npm install

# 2. 서버 실행
npm start
```

## 폰에서 접속하기

1. PC와 스마트폰이 **같은 와이파이**에 연결되어 있어야 합니다
2. PC의 IP 주소 확인:
   - Windows: 명령 프롬프트에서 `ipconfig` → IPv4 주소
   - Mac: 터미널에서 `ifconfig | grep inet`
3. 폰 브라우저에서 `http://[PC IP 주소]:3000` 접속
   - 예: `http://192.168.1.5:3000`

## 기능

- 9홀 / 18홀 선택
- 동반자 스코어 함께 입력
- 매홀 타수 / 페어웨이 안착(FW) / 레귤러온(GIR) / 퍼팅 입력
- 핸디캡 및 네트 스코어 계산
- 라운드 요약 (홀별 결과 테이블)
- 통계 대시보드 (스코어 추이, FW/GIR/퍼팅 분석, 결과 분포)
- 새 라운드에서 네이버 이미지 검색 결과를 선택해 홀맵으로 저장할 수 있고, 이후 해당 구장의 각 홀 입력 화면에서 다시 볼 수 있습니다.
- 데이터는 `data/rounds.json`에 저장

## 데이터 백업

`data/rounds.json` 파일을 복사해두면 서버에 저장된 라운드 기록이 보존됩니다. 홀맵 이미지는 브라우저의 IndexedDB에 기기별로 저장되며 현재 백업 파일에는 포함되지 않습니다.

## 네이버 홀맵 이미지 검색 설정

GitHub Pages는 비밀 API 키를 보관할 서버 기능이 없으므로 네이버 이미지 검색에는 별도의 Cloudflare Worker가 필요합니다. 네이버 Client ID/Secret은 웹앱이나 저장소에 넣지 말고 Worker secret으로만 등록하세요.

1. [네이버 개발자센터](https://developers.naver.com/)에서 애플리케이션을 등록하고 검색 이미지 API를 사용할 수 있도록 설정한 뒤 Client ID와 Client Secret을 발급받습니다.
2. [Cloudflare Workers](https://workers.cloudflare.com/) 계정을 준비하고, 이 저장소 루트에서 Wrangler 로그인을 합니다:

   ```bash
   npx wrangler login
   ```

3. 네이버 인증값과 이미지 서명용 임의의 긴 비밀값을 Worker secret으로 등록합니다:

   ```bash
   npx wrangler secret put NAVER_CLIENT_ID
   npx wrangler secret put NAVER_CLIENT_SECRET
   npx wrangler secret put IMAGE_TOKEN_SECRET
   ```

4. 저장소 루트에서 Worker를 배포합니다:

   ```bash
   npx wrangler deploy
   ```

   배포 결과로 나온 `https://qg-golf-course-search.<계정>.workers.dev` 주소를 앱의 설정 탭 > 네이버 홀맵 검색에 저장합니다. Naver API 호출 키는 Worker에서만 사용하며, 이미지 선택 토큰은 10분 후 만료됩니다.
5. 라운드 시작 창에서 구장명을 입력하고 **네이버에서 홀맵 검색**을 누른 뒤, 맞는 이미지를 선택해 저장합니다. 저장된 이미지는 같은 브라우저에서 이후 해당 구장의 각 홀 입력 화면에 표시됩니다. 검색 결과가 항상 공식 홀맵인 것은 아니므로 이미지를 확인한 후 선택하세요.

Worker는 `ALLOWED_ORIGIN`을 현재 GitHub Pages 사이트로 제한합니다. 별도 도메인을 사용한다면 `wrangler.toml`의 값을 바꿔 다시 배포하세요. 검색 API 사용량과 Worker 호출을 보호하기 위해 Cloudflare 대시보드에서 요청 제한 규칙을 설정하는 것을 권장합니다. 네이버 검색 결과 및 이미지의 이용은 네이버와 원본 사이트의 약관·저작권 조건을 따라야 합니다.
