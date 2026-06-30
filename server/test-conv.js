const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Tester la requête conversations exacte
const userId = 4; // admin
pool.query(`
  SELECT c.*,
    u.nom AS avec_nom, u.role AS avec_role, u.ville AS avec_ville,
    (SELECT contenu FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS derniere,
    (SELECT type FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS derniere_type,
    (SELECT created_at FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) AS derniere_date,
    (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != $1 AND lu = 0) AS non_lus
  FROM conversations c
  JOIN users u ON u.id = CASE WHEN c.user1_id = $2 THEN c.user2_id ELSE c.user1_id END
  WHERE (c.user1_id = $3 OR c.user2_id = $4)
    AND (CASE WHEN c.user1_id = $5 THEN c.deleted_u1 ELSE c.deleted_u2 END) = 0
  ORDER BY COALESCE(derniere_date, c.created_at) DESC
`, [userId, userId, userId, userId, userId])
.then(r => { console.log('OK:', r.rows.length, 'rows'); pool.end(); })
.catch(e => { console.error('ERREUR:', e.message); pool.end(); });
