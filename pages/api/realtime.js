// Deprecated realtime endpoint placeholder. Intentionally empty to avoid route 404.
export default function handler(req, res){
	res.status(410).json({ error: 'Deprecated endpoint' });
}
