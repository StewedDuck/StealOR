// import StealorsApp from "@/components/StealorsApp";

// export default function HomePage() {
//   return <StealorsApp />;
// }

import SideBar from "@/components/sideBar";

export default function HomePage() {
  return (
    <div>
      <SideBar />

      <main className="main-content">
        <h1>Welcome to sTealORs</h1>
      </main>
    </div>
  );
}
