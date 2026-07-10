import bgAsset from "@/assets/home-bg.jpg.asset.json";

export function SiteAmbient() {
  return (
    <div aria-hidden className="site-ambient">
      <div className="home-ambient__bg" />
      <div
        className="home-ambient__photo"
        style={{ backgroundImage: `url(${bgAsset.url})` }}
      />
      <div className="home-ambient__grain" />
      <div className="home-ambient__halo home-ambient__halo--1" />
      <div className="home-ambient__halo home-ambient__halo--2" />
      <div className="home-ambient__halo home-ambient__halo--3" />
      <div className="home-ambient__smoke home-ambient__smoke--a" />
      <div className="home-ambient__smoke home-ambient__smoke--b" />
      <div className="home-ambient__vignette" />
    </div>
  );
}