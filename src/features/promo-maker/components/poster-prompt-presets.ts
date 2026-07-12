export const posterPromptPresets = [
  {
    id: "quiet-recital",
    label: "차분한 리사이틀",
    description: "여백, 낮은 채도, 공연 정보 가독성 중심",
    value: "얼굴과 승인된 프로필 후보는 유지하고, 여백이 많은 차분한 클래식 리사이틀 포스터. 따뜻한 아이보리와 먹색 중심, 제목은 크게 읽히게.",
  },
  {
    id: "stage-light",
    label: "무대 조명",
    description: "콘서트홀 조명과 깊은 명암 중심",
    value: "얼굴은 바꾸지 말고, 콘서트홀 무대 조명과 깊은 명암을 사용한 고급 포스터. 검정, 금색, 짙은 블루 계열. 예매 QR은 잘 보이게.",
  },
  {
    id: "modern-type",
    label: "현대 타이포",
    description: "강한 제목 대비와 기하학적 구성",
    value: "승인된 연주자 이미지는 고정하고, 현대적인 타이포그래피 중심의 포스터. 강한 제목 대비, 기하학적 도형, 깔끔한 정보 정리.",
  },
  {
    id: "warm-recital",
    label: "따뜻한 감성",
    description: "부드러운 조명과 감성적인 독주회 톤",
    value: "연주자 얼굴과 포즈는 유지하고, 부드러운 조명과 따뜻한 색감의 감성적인 리사이틀 포스터. 너무 귀엽거나 스티커사진 느낌은 피하기.",
  },
] as const;

export type PosterPromptPreset = (typeof posterPromptPresets)[number];
