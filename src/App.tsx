function App() {
  return (
    <div className="app-container">
      <header>
        <h1 className="title-1">Welcome to React</h1>
      </header>
      <main>
        <form className="add-website-form">
          <div className="group">
            <input type="text" placeholder="Website URL" />
            <input type="number" placeholder="Time in minutes" />
          </div>
          <button type="submit" className="solid-success">
            Add Website
          </button>
        </form>

        <ul className="limited-websites-list">
          <li>
            <p>Facebook (10 mins)</p>
            <button className="solid-danger">Delete</button>
          </li>
        </ul>
      </main>
    </div>
  );
}

export default App;
