import 'dotenv/config';

const COMPUTE_SERVER = process.env.COMPUTE_SERVER || 'http://localhost:6500';
const API_KEY = process.env.API_KEY || '';

const rawResp = await fetch(`${COMPUTE_SERVER}/plugins/gh/installed`, {
	method: 'GET',
	headers: { 'Content-Type': 'application/json', RhinoComputeKey: API_KEY }
});

if (!rawResp.ok) {
	const errorText = await rawResp.text();
	console.error(
		`Error fetching installed plugins: ${rawResp.status} ${rawResp.statusText}\n${errorText}`
	);
	process.exit(1);
}

const plugins = await rawResp.json();
console.log('Installed Grasshopper Plugins:', plugins);
