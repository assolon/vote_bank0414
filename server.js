const express = require('express');
const path = require('path');
const app = express();

// 정적 파일 제공
app.use(express.static(__dirname));

// 모든 요청을 index.html로 라우팅
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
}); 