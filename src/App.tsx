import { createSignal } from "solid-js";

function App() {
  const [message] = createSignal("Welcome to Limit App Usage");

  return (
    <div
      style={{
        padding: "20px",
        width: "300px",
        background: "white",
        "border-radius": "10px",
      }}
    >
      <h2 style={{ color: "black" }}>{message()}</h2>
      <p style={{ color: "black" }}>
        Limit your social media usage with this extension.
      </p>
    </div>
  );
}

export default App;
