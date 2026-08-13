export function HomePage() {
  return (
    <>
      <div className="content-header">
        <h1>홈</h1>
        <p className="content-sub">오늘도 신선하게, 힐링푸드 사내 시스템에 오신 것을 환영합니다.</p>
      </div>

      <div className="placeholder-grid">
        <section className="placeholder-card">
          <div className="placeholder-card-head">
            <h2>공지사항</h2>
            <span className="placeholder-tag">연동 예정</span>
          </div>
          <div className="placeholder-body">
            <p>사내 공지사항이 이 영역에 표시될 예정입니다.</p>
          </div>
        </section>

        <section className="placeholder-card">
          <div className="placeholder-card-head">
            <h2>즐겨찾기</h2>
            <span className="placeholder-tag">연동 예정</span>
          </div>
          <div className="placeholder-body">
            <p>자주 쓰는 메뉴를 즐겨찾기로 모아볼 수 있습니다.</p>
          </div>
        </section>
      </div>
    </>
  );
}
