# todo-app

할 일 웹앱. [zoona/todo](https://github.com/zoona/todo)의 이슈를 읽고 쓴다.
이 repo에는 앱 코드만 있고 할 일은 들어오지 않는다.

주소: https://zoona.github.io/todo-app/

## 쓰는 법

처음 열면 토큰을 한 번 붙여넣는다. fine-grained PAT를 `zoona/todo` 하나만 골라 만들고
권한은 **Issues 읽기·쓰기**와 **Contents 읽기**(`hub.json` 때문). 토큰은 이 브라우저의
localStorage에만 저장되고 어디로도 나가지 않는다.

폰에서는 사파리로 열고 공유 버튼 → 홈 화면에 추가. 그러면 주소창 없이 앱처럼 열린다.

## 무엇을 보여주나

- 카테고리별(`일` `개인` `학습` `아이디어` `미분류`) 열린 할 일
- 마감이 지났거나 오늘인 것은 맨 위 "지금 볼 것"에 한 번 더
- `zoona/todo`의 `hub.json`을 읽어 프로젝트 남은 일을 읽기 전용으로. 이건 워크플로가
  `zoona/working`의 HUB를 파싱해 만든 파일이다

## 데이터

이슈가 정본이다. 필드를 새로 만들지 않고 이슈가 이미 가진 것에 얹는다.

| 무엇 | 어디 |
|------|------|
| 할 일 | 제목 |
| 카테고리 | 라벨 |
| 완료 | 이슈 닫힘 |
| 마감 | 본문의 `마감: YYYY-MM-DD` 줄 |
| 출처 | 본문의 `출처: ...` 줄 |

## 개발

```bash
npm install
npm run dev
npx vitest run
```

`src/parse.ts`가 순수 함수라 테스트가 여기 붙는다. `src/api.ts`는 네트워크에 붙는
얇은 층이고 화면은 `src/App.tsx` 하나다.

푸시하면 Actions가 테스트와 빌드를 돌리고 Pages로 배포한다.

## 설계

`zoona/working`의 `projects/task-dashboard/design/2026-09-05-웹앱-설계.md`.

## 타입 검사는 `npm run build`로

루트 `tsconfig.json`은 `files: []`에 프로젝트 참조만 있어서 `tsc --noEmit`은
**아무 파일도 검사하지 않고 통과한다.** 실제 검사는 `tsc -b`이고, 그건
`npm run build`가 한다.
