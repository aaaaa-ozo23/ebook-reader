import { defaultReaderTheme } from "@reader/core";
import "./App.css";

function App() {
  return (
    <main
      className="app-shell"
      aria-label="Ebook Reader"
      style={{
        backgroundColor: defaultReaderTheme.backgroundColor,
        color: defaultReaderTheme.textColor,
        fontFamily: defaultReaderTheme.fontFamily,
      }}
    >
      <section className="empty-shell">
        <h1>Ebook Reader</h1>
        <p>Desktop shell initialized.</p>
      </section>
    </main>
  );
}

export default App;
