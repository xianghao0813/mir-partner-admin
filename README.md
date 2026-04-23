# MIR Partner Admin

독립 운영용 관리자 사이트입니다.

## 목적

- 운영 사이트와 분리된 관리자 인증
- 뉴스/배너/콘텐츠 발행
- 유저 관리, CRM, 운영 메모, 데이터 분석 기능 확장
- 운영 사이트는 이 앱의 공개 콘텐츠 API만 읽음

## 기본 구조

- `app/login`: 관리자 로그인
- `app/dashboard`: 관리자 대시보드
- `app/api/public/news`: 운영 사이트가 읽을 공개 뉴스 API
- `lib/auth.ts`: 관리자 세션 검사
- `lib/supabaseAdmin.ts`: service role 기반 관리자 작업

## 권장 운영 방식

1. 관리자용 Supabase 프로젝트를 별도로 사용
2. 관리자 계정만 이 프로젝트의 auth users 에 생성
3. 운영 사이트는 별도 auth 를 유지
4. 공용 콘텐츠 저장소는 별도 DB 또는 읽기 전용 schema 로 관리

## 다음 단계

1. 뉴스 CRUD 화면 완성
2. 배너/카테고리 관리 추가
3. 유저 데이터 수집 테이블 설계
4. 분석 대시보드 API 및 차트 추가

## Local URL

- Admin site: `http://localhost:3001`

## Deployment env

운영 사이트에는 아래 값을 설정해야 합니다.

- `ADMIN_PUBLIC_API_BASE_URL=https://admin.your-domain.com`
