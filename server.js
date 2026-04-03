const express = require('express');
const multer = require('multer');
const { v2: cloudinary } = require('cloudinary');
const path = require('path');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// Cloudinary 설정 — 환경변수에서 읽음 (코드에 Key 없음)
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const FOLDER = 'family-album';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── 사진 목록 조회 ────────────────────────────────────────────
app.get('/api/photos', async (req, res) => {
  try {
    const result = await cloudinary.search
      .expression(`folder:${FOLDER}`)
      .sort_by('created_at', 'desc')
      .max_results(500)
      .execute();

    const photos = result.resources.map(r => ({
      public_id: r.public_id,
      url:   cloudinary.url(r.public_id, { quality: 'auto', fetch_format: 'auto', width: 1200 }),
      thumb: cloudinary.url(r.public_id, { quality: 'auto', fetch_format: 'auto', width: 400, height: 400, crop: 'fill' }),
      created_at: r.created_at,
    }));

    res.json({ photos });
  } catch (err) {
    console.error('사진 목록 오류:', err);
    res.status(500).json({ error: '사진 목록을 불러오지 못했어요' });
  }
});

// ── 사진 업로드 ───────────────────────────────────────────────
app.post('/api/photos/upload', upload.array('files'), async (req, res) => {
  try {
    const results = await Promise.all(
      req.files.map(file =>
        new Promise((resolve, reject) => {
          cloudinary.uploader.upload_stream(
            { folder: FOLDER, resource_type: 'image' },
            (err, result) => err ? reject(err) : resolve(result)
          ).end(file.buffer);
        })
      )
    );
    res.json({ uploaded: results.length });
  } catch (err) {
    console.error('업로드 오류:', err);
    res.status(500).json({ error: '업로드에 실패했어요' });
  }
});

// ── 사진 삭제 ─────────────────────────────────────────────────
app.delete('/api/photos/:public_id(*)', async (req, res) => {
  try {
    const public_id = req.params.public_id;
    await cloudinary.uploader.destroy(public_id);
    res.json({ deleted: true });
  } catch (err) {
    console.error('삭제 오류:', err);
    res.status(500).json({ error: '삭제에 실패했어요' });
  }
});

// ── 서버 시작 ─────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`서버 실행 중: http://localhost:${PORT}`));
