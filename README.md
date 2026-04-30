# 반코마이신 TDM 계산기

반코마이신 치료적 약물 모니터링(Therapeutic Drug Monitoring) 웹 계산기입니다.
환자 정보와 실측 혈중 농도를 입력하면 베이지안 방법으로 개인화된 약동학 파라미터를 추정하고, AUC 기반 용량 조절 권장사항을 제공합니다.

**배포 주소**: https://qutechoi.github.io/SimpleTDM/

---

## ⚠️ 주의 사항

이 도구는 **교육 및 연구 목적**으로만 제작되었습니다.
임상 환경에서 실제 환자 치료에 사용하지 마십시오.
모든 투약 결정은 자격을 갖춘 의료 전문가가 내려야 합니다.

---

## 주요 기능

### 약동학 계산
- **성인**: Cockcroft-Gault 공식으로 크레아티닌 청소율 계산, Matzke 방정식으로 제거 속도 상수 추정
- **소아 (18세 미만)**: Schwartz 공식으로 소아 크레아티닌 청소율 계산 (연령별 k값 자동 적용)
- 이상 체중(IBW) · 조정 체중(AdjBW) 자동 계산
- AUC24, Trough, 반감기, 청소율 결과 제공

### 베이지안 파라미터 피팅
- 측정 농도 1개: 단일 포인트 Vd 보정
- 측정 농도 2개 이상: Nelder-Mead Simplex 최적화로 다중 포인트 베이지안 피팅
- 피팅 품질 지표 표시 (우수 / 적절 / 불량)

### 투약 요법 변경 처리
- 치료 도중 용량·간격이 바뀌는 경우 여러 요법을 순차적으로 입력 가능
- 농도 예측은 모든 실제 투약 사건의 직접 중첩(superposition)으로 계산 — 요법 전환 구간도 정확히 반영
- 베이지안 피팅이 모든 요법에 걸친 측정값을 함께 사용
- 요약 메트릭(AUC24/Trough/T½)은 **마지막(현재) 요법** 정상상태 기준
- 농도-시간 곡선 위에 요법 변경 지점을 마름모 마커로 표시

### 용량 시뮬레이션
- 특정 용량 · 투약 간격 입력 시 예상 AUC · Trough 미리 계산
- 다양한 용량 옵션별 상태 표시 (최적 / 적절 / 치료 미달 / 독성 위험)

### 편의 기능
- 데이터 저장 · 불러오기 · 초기화 (브라우저 localStorage)
- 결과 인쇄
- 다크 / 브라이트 테마
- 한국어 / 영어 전환
- PWA 지원 (홈 화면 추가 가능)

---

## 계산 방법론

### 성인 PK

| 항목 | 공식 |
|------|------|
| 크레아티닌 청소율 | Cockcroft-Gault: `CrCl = ((140 - 나이) × 체중) / (72 × SCr)` (여성 × 0.85) |
| 제거 속도 상수 | Matzke: `Kel = 0.00083 × CrCl + 0.0044` |
| 분포 용적 | `Vd = 0.7 L/kg` |
| AUC24 | `AUC24 = 일일 총 투여량 / (Kel × Vd)` |

### 소아 PK (18세 미만)

Schwartz 공식으로 CrCl 계산: `CrCl = k × 키(cm) / SCr`

| 연령 | k값 |
|------|-----|
| 1세 미만 (영아) | 0.45 |
| 1 ~ 12세 | 0.55 |
| 13 ~ 17세 남자 청소년 | 0.70 |
| 13 ~ 17세 여자 청소년 | 0.55 |

### 목표 범위

| 지표 | 목표 | 판정 |
|------|------|------|
| AUC24 | 400 ~ 600 mg·h/L | 미만: 증량 검토 / 초과: 감량 검토 |
| Trough | 10 ~ 20 mg/L | 참고 지표 |

---

## 사용 방법

1. **환자 정보 입력**
   나이(세/개월), 성별, 키, 체중, 혈청 크레아티닌 입력
   → 18세 미만이면 소아 모드 자동 전환

2. **투약 요법 입력**
   용량(mg), 투약 간격(시간), 첫 투약 시간 입력
   → 치료 도중 요법이 변경된 경우 "+ 요법 추가" 버튼으로 새 요법(변경 시점·새 용량·새 간격)을 추가

3. **측정 농도 입력**
   채혈 시간과 실측 혈중 농도(mg/L) 입력
   (2개 이상 입력 시 베이지안 피팅 정확도 향상)

4. **계산 & 분석 클릭**
   AUC, Trough, 농도-시간 곡선, 용량 권장사항 확인

5. **용량 시뮬레이션 (선택)**
   원하는 용량·간격을 입력해 예상 결과 미리 확인

---

## 로컬 실행 방법

### 요구사항
- Node.js 18 이상
- 최신 웹 브라우저

### 설치 및 실행

```bash
# 저장소 클론
git clone https://github.com/qutechoi/SimpleTDM.git
cd SimpleTDM

# 패키지 설치
npm install

# 개발 서버 실행 (http://localhost:3000)
npm run dev

# 프로덕션 빌드
npm run build

# 단위 테스트 실행
npm test
```

### 프로젝트 구조

```
SimpleTDM/
├── index.html              # 메인 HTML
├── style.css               # 스타일시트
├── manifest.json           # PWA 매니페스트
├── sw.js                   # 서비스 워커
├── vite.config.js          # Vite 빌드 설정
├── js/
│   ├── app.js              # 앱 진입점 및 UI 로직
│   ├── pk-calculations.js  # 약동학 계산 함수 (성인 + 소아, 다중 요법 중첩)
│   ├── bayesian-fitting.js # 베이지안 파라미터 피팅
│   ├── chart.js            # 농도-시간 곡선 차트
│   ├── history.js          # 계산 히스토리 저장 및 CSV 내보내기
│   ├── validation.js       # 입력값 유효성 검사
│   └── i18n.js             # 한국어/영어 번역
├── tests/
│   ├── pk-calculations.test.js   # PK 계산 단위 테스트 (51개)
│   └── bayesian-fitting.test.js  # 베이지안 피팅 단위 테스트 (24개)
└── .github/workflows/
    └── deploy.yml          # GitHub Actions 자동 배포
```

---

## 기술 스택

- **프론트엔드**: Vanilla JavaScript (ES Modules), HTML5, CSS3
- **차트**: Chart.js 4.4
- **빌드**: Vite 6 + esbuild
- **배포**: GitHub Pages (GitHub Actions 자동 배포)
- **PWA**: Service Worker + Web App Manifest

---

## 참고 문헌

1. Rybak MJ, et al. Therapeutic monitoring of vancomycin for serious MRSA infections. *Am J Health Syst Pharm.* 2020;77(11):835-864.
2. Matzke GR, et al. Pharmacokinetics of vancomycin in patients with various degrees of renal function. *Antimicrob Agents Chemother.* 1984;25(4):433-437.
3. Cockcroft DW, Gault MH. Prediction of creatinine clearance from serum creatinine. *Nephron.* 1976;16(1):31-41.
4. Schwartz GJ, et al. New equations to estimate GFR in children with CKD. *J Am Soc Nephrol.* 2009;20(3):629-637.
5. Devine BJ. Gentamicin therapy. *Drug Intell Clin Pharm.* 1974;8:650-655.

---

**버전**: 1.1.0
