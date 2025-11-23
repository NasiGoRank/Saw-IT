import readline from 'readline';
import mqtt from 'mqtt';

class SimulatorCLI {
    constructor() {
        this.client = mqtt.connect('mqtt://localhost:1883');
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        this.setupCLI();
    }

    setupCLI() {
        console.log('\n🎮 IoT Simulator Controller');
        console.log('========================');
        console.log('Commands:');
        console.log('  on     - Turn water ON');
        console.log('  off    - Turn water OFF');
        console.log('  auto   - Set to auto mode');
        console.log('  soil <value> - Set soil moisture (0-100)');
        console.log('  rain <value> - Set rain level (0-100)');
        console.log('  simulate-rain - Simulate rain for 10s');
        console.log('  dry-soil - Simulate very dry soil');
        console.log('  status  - Show current state');
        console.log('  help    - Show this help');
        console.log('  exit    - Quit\n');

        this.rl.on('line', (input) => {
            this.handleCommand(input.trim());
        });
    }

    handleCommand(input) {
        const [command, value] = input.split(' ');

        switch (command) {
            case 'on':
                this.client.publish('irrigation/control', 'WATER_ON');
                console.log('💧 Sent WATER_ON command');
                break;

            case 'off':
                this.client.publish('irrigation/control', 'WATER_OFF');
                console.log('🛑 Sent WATER_OFF command');
                break;

            case 'auto':
                this.client.publish('irrigation/control', 'AUTO_MODE');
                console.log('🤖 Sent AUTO_MODE command');
                break;

            case 'soil':
                const soilValue = parseInt(value);
                if (!isNaN(soilValue) && soilValue >= 0 && soilValue <= 100) {
                    this.client.publish('irrigation/control', `SOIL_${soilValue}`);
                    console.log(`🌱 Set soil moisture to ${soilValue}%`);
                } else {
                    console.log('❌ Invalid soil value (0-100)');
                }
                break;

            case 'rain':
                const rainValue = parseInt(value);
                if (!isNaN(rainValue) && rainValue >= 0 && rainValue <= 100) {
                    this.client.publish('irrigation/control', `RAIN_${rainValue}`);
                    console.log(`🌧️ Set rain level to ${rainValue}%`);
                } else {
                    console.log('❌ Invalid rain value (0-100)');
                }
                break;

            case 'simulate-rain':
                this.client.publish('irrigation/control', 'SIMULATE_RAIN');
                console.log('🌧️ Triggered rain simulation');
                break;

            case 'dry-soil':
                this.client.publish('irrigation/control', 'DRY_SOIL');
                console.log('🏜️ Triggered dry soil simulation');
                break;

            case 'status':
                this.client.publish('irrigation/control', 'STATUS_REQUEST');
                console.log('📊 Requested status update');
                break;

            case 'help':
                this.showHelp();
                break;

            case 'exit':
                console.log('👋 Goodbye!');
                this.client.end();
                this.rl.close();
                process.exit(0);
                break;

            default:
                console.log('❌ Unknown command. Type "help" for available commands.');
        }
    }

    showHelp() {
        console.log('\nAvailable commands:');
        console.log('  on, off, auto, soil <0-100>, rain <0-100>');
        console.log('  simulate-rain, dry-soil, status, help, exit\n');
    }
}

// Start the CLI
new SimulatorCLI();