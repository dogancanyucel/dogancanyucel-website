const fs = require('fs');

async function seedDatabase() {
    console.log("🚀 Reading local JSON file...");
    try {
        const rawData = fs.readFileSync('./raw_exercises.json', 'utf8');
        const exercises = JSON.parse(rawData);
        
        console.log(`📦 Found ${exercises.length} exercises. Preparing SQL script...`);
        
        // Removed TRANSACTION wrappers for Cloudflare compatibility
        let sqlStatements = "PRAGMA foreign_keys=OFF;\n";
        
        for (const ex of exercises) {
            const name = (ex.name || "").replace(/'/g, "''");
            const target = (ex.target || "").replace(/'/g, "''");
            const bodyPart = (ex.bodyPart || "").replace(/'/g, "''");
            const equipment = (ex.equipment || "").replace(/'/g, "''");
            const gifUrl = (ex.gifUrl || "").replace(/'/g, "''");
            const instructions = ex.instructions ? JSON.stringify(ex.instructions).replace(/'/g, "''") : "[]";
            
            sqlStatements += `INSERT INTO exercises (name, target, bodyPart, equipment, gifUrl, instructions) VALUES ('${name}', '${target}', '${bodyPart}', '${equipment}', '${gifUrl}', '${instructions}');\n`;
        }
        
        fs.writeFileSync('./data.sql', sqlStatements);
        console.log("✅ data.sql has been successfully created without transaction wrappers!");
        
    } catch (error) {
        console.error("❌ Error occurred:", error.message);
    }
}

seedDatabase();