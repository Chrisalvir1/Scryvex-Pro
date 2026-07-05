const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const pluginsDir = path.join(__dirname, 'plugins');
const targetIP = '192.168.110.147';

const pluginsToDeploy = fs.readdirSync(pluginsDir).filter(dir => {
    const pkgPath = path.join(pluginsDir, dir, 'package.json');
    if (!fs.existsSync(pkgPath)) return false;
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    // We want to deploy plugins that have been renamed to end in 27
    return pkg.name && pkg.name.endsWith('27');
});

console.log(`Found ${pluginsToDeploy.length} plugins to deploy:`, pluginsToDeploy);

for (const plugin of pluginsToDeploy) {
    const pluginPath = path.join(pluginsDir, plugin);
    console.log(`\n========================================`);
    console.log(`Deploying ${plugin} to ${targetIP}...`);
    console.log(`========================================`);
    
    try {
        // Ejecuta el build y el deploy usando scrypted-deploy
        execSync(`npm run build && npm run scrypted-deploy ${targetIP}`, { 
            cwd: pluginPath, 
            stdio: 'inherit',
            env: { ...process.env, NODE_ENV: 'production' }
        });
        console.log(`✅ Success: ${plugin}`);
    } catch (error) {
        console.error(`❌ Failed: ${plugin}`);
        console.error(error.message);
    }
}

console.log('\nDeployment finished.');
