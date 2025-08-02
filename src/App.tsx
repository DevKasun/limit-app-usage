import { createSignal } from "solid-js";

function App() {
  const [message] = createSignal("Welcome to Limit App Usage");

  return (
    <div style={{ padding: "20px", width: "300px" }}>
      <h1>{message()}</h1>
      <p>Limit your social media usage with this extension.</p>
    </div>
  );
}

export default App;
