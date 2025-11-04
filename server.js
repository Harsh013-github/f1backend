const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json());

// Example route
app.get('/api/hello', (req, res) => {
  res.json({ message: 'Running from the backend!' });
});

// Start the server
const PORT = 5000;
app.listen(PORT, () => console.log("Server running on http://35.172.222.26:${PORT}"));
