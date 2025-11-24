// server.js - backend completo VipCortes (MySQL local)
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import fs from 'fs/promises';
import path from 'path';

const app = express();
const PORT = 10000;

// ----------- Middleware -----------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('.')); // serve HTML/CSS/JS da mesma pasta

// ----------- Conexão MySQL -----------
let db;
const DATA_DIR = path.resolve('.', 'data');
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews.json');
const AGENDAMENTOS_FILE = path.join(DATA_DIR, 'agendamentos.json');

try {
  db = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'vipcortes'
  });
  console.log('Conectado ao banco de dados MySQL!');
} catch (err) {
  console.error('Erro ao conectar ao banco de dados MySQL:', err.message);
  console.log('Usando fallback para armazenamento local (JSON).');
  db = null;
  // garante que diretório e arquivo existam
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try {
      await fs.access(REVIEWS_FILE);
    } catch {
      await fs.writeFile(REVIEWS_FILE, '[]', 'utf8');
    }
    try {
      await fs.access(AGENDAMENTOS_FILE);
    } catch {
      await fs.writeFile(AGENDAMENTOS_FILE, '[]', 'utf8');
    }
    console.log('Arquivo de dados local preparado em', REVIEWS_FILE);
  } catch (err2) {
    console.error('Erro ao preparar armazenamento local:', err2.message);
  }
}

// ----------- Criar tabelas se não existirem -----------
if (db) {
  await db.execute(`
CREATE TABLE IF NOT EXISTS usuarios (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE,
  password VARCHAR(255) NOT NULL,
  phone VARCHAR(20)
);
`);

  await db.execute(`
CREATE TABLE IF NOT EXISTS agendamentos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  age INT,
  phone VARCHAR(20),
  service VARCHAR(100),
  data_agendamento DATE,
  hora TIME,
  observacoes TEXT
);
`);

  await db.execute(`
CREATE TABLE IF NOT EXISTS reviews (
  id INT AUTO_INCREMENT PRIMARY KEY,
  author_name VARCHAR(100),
  content TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`);
    await db.execute(`
  CREATE TABLE IF NOT EXISTS reviews (
    id INT AUTO_INCREMENT PRIMARY KEY,
    author_name VARCHAR(100),
    content TEXT NOT NULL,
    rating INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
  `);
    // garantir coluna rating se tabela antiga não tiver
    try {
      await db.execute('ALTER TABLE reviews ADD COLUMN rating INT DEFAULT 0');
    } catch (errCol) {
      // se a coluna já existe ou outro erro, ignorar
    }

  await db.execute(`
CREATE TABLE IF NOT EXISTS fidelidades (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT,
  pontos INT DEFAULT 0,
  status VARCHAR(20) DEFAULT 'ativo'
);
`);
} else {
  console.log('Banco MySQL não disponível — pulando criação de tabelas e usando JSON local quando aplicável.');
}

// ----------- Rotas API -----------

// Signup
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const [result] = await db.execute(
      'INSERT INTO usuarios (name,email,password,phone) VALUES (?,?,?,?)',
      [name, email, hash, phone]
    );
    res.json({ message: 'Usuário criado com sucesso!', userId: result.insertId });
  } catch (err) {
    console.error(err);
    res.status(400).json({ error: 'Erro ao criar usuário. Email pode já estar cadastrado.' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    const [rows] = await db.execute('SELECT * FROM usuarios WHERE email = ?', [email]);
    if (!rows.length) return res.status(404).json({ error: 'Usuário não encontrado' });

    const user = rows[0];
    const match = await bcrypt.compare(senha, user.password);
    if (!match) return res.status(401).json({ error: 'Senha incorreta' });

    res.json({ message: 'Login realizado com sucesso', userId: user.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro no login' });
  }
});

// Criar agendamento (sem usuário vinculado)
app.post('/api/agendamentos', async (req, res) => {
  try {
    const { name, age, phone, service, date, time, observacoes } = req.body;
    if (db) {
      await db.execute(
        `INSERT INTO agendamentos (name, age, phone, service, data_agendamento, hora, observacoes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [name, age, phone, service, date, time, observacoes || null]
      );
      res.json({ message: 'Agendamento criado com sucesso' });
    } else {
      // fallback para arquivo JSON
      const fileContent = await fs.readFile(AGENDAMENTOS_FILE, 'utf8');
      const arr = JSON.parse(fileContent || '[]');
      const maxId = arr.reduce((m, a) => (a.id && a.id > m ? a.id : m), 0);
      const newItem = {
        id: maxId + 1,
        name,
        age: age || null,
        phone: phone || '',
        service: service || '',
        data_agendamento: date || null,
        hora: time || null,
        observacoes: observacoes || null
      };
      arr.push(newItem);
      await fs.writeFile(AGENDAMENTOS_FILE, JSON.stringify(arr, null, 2), 'utf8');
      res.json({ message: 'Agendamento criado (armazenamento local)' });
    }
  } catch (err) {
    console.error('Erro ao criar agendamento:', err);
    res.status(500).json({ error: 'Erro ao criar agendamento' });
  }
});

// Listar agendamentos
app.get('/api/agendamentos', async (req, res) => {
  try {
    if (db) {
      const [rows] = await db.execute('SELECT * FROM agendamentos ORDER BY data_agendamento, hora');
      res.json({ appointments: rows });
    } else {
      const content = await fs.readFile(AGENDAMENTOS_FILE, 'utf8');
      const rows = JSON.parse(content || '[]');
      // ordenar por data_agendamento e hora
      rows.sort((a, b) => {
        const da = a.data_agendamento ? new Date(a.data_agendamento) : new Date(0);
        const dbt = b.data_agendamento ? new Date(b.data_agendamento) : new Date(0);
        if (da < dbt) return -1;
        if (da > dbt) return 1;
        const ha = a.hora || '';
        const hb = b.hora || '';
        return ha.localeCompare(hb);
      });
      res.json({ appointments: rows });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar agendamentos' });
  }
});

// Excluir agendamento
app.delete('/api/agendamentos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (db) {
      await db.execute('DELETE FROM agendamentos WHERE id = ?', [id]);
      res.json({ message: 'Agendamento excluído com sucesso' });
    } else {
      const content = await fs.readFile(AGENDAMENTOS_FILE, 'utf8');
      const arr = JSON.parse(content || '[]');
      const newArr = arr.filter(a => String(a.id) !== String(id));
      await fs.writeFile(AGENDAMENTOS_FILE, JSON.stringify(newArr, null, 2), 'utf8');
      res.json({ message: 'Agendamento excluído (armazenamento local)' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir agendamento' });
  }
});

// Reviews
app.get('/api/reviews', async (req, res) => {
  try {
    if (db) {
      const [rows] = await db.execute('SELECT * FROM reviews ORDER BY created_at DESC');
      res.json({ reviews: rows });
    } else {
      // ler do arquivo JSON local
      const content = await fs.readFile(REVIEWS_FILE, 'utf8');
      const rows = JSON.parse(content || '[]');
      // garantir rating em cada registro e ordenar por created_at desc se existir
      for (const r of rows) {
        if (typeof r.rating === 'undefined') r.rating = 0;
      }
      rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      res.json({ reviews: rows });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar avaliações' });
  }
});

app.post('/api/reviews', async (req, res) => {
  try {
    const { author_name, content, rating } = req.body;
    const rValue = Number.isFinite ? (Number(rating) || 0) : (rating || 0);
    if (db) {
      await db.execute(
        'INSERT INTO reviews (author_name, content, rating) VALUES (?, ?, ?)',
        [author_name || 'Anônimo', content, rValue]
      );
      res.json({ message: 'Avaliação enviada com sucesso' });
    } else {
      // salvar no arquivo JSON local
      const fileContent = await fs.readFile(REVIEWS_FILE, 'utf8');
      const arr = JSON.parse(fileContent || '[]');
      const maxId = arr.reduce((m, r) => (r.id && r.id > m ? r.id : m), 0);
      const newReview = {
        id: maxId + 1,
        author_name: author_name || 'Anônimo',
        content,
        rating: Number(rating) || 0,
        created_at: new Date().toISOString()
      };
      arr.push(newReview);
      await fs.writeFile(REVIEWS_FILE, JSON.stringify(arr, null, 2), 'utf8');
      res.json({ message: 'Avaliação enviada com sucesso (armazenamento local)' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao enviar avaliação' });
  }
});

// Fidelidade - cancelar cartão
app.post('/api/fidelities/:userId/cancel', async (req, res) => {
  try {
    const { userId } = req.params;
    await db.execute('UPDATE fidelidades SET status="cancelado" WHERE usuario_id=?', [userId]);
    res.json({ message: 'Cartão fidelidade cancelado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao cancelar cartão' });
  }
});

// ----------- Servir frontend -----------
app.get('/', (req, res) => {
  res.sendFile('index.html', { root: '.' });
});

// ----------- Iniciar servidor -----------
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}/`);
});
