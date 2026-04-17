import { InputState } from '../../TYPES';

export class InputManager {
    private static instance: InputManager;
    private keys: Map<string, boolean> = new Map();
    private mouseX: number = 0;

    private constructor() {
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);
        window.addEventListener('mousemove', this.handleMouseMove);
    }

    static getInstance(): InputManager {
        if (!InputManager.instance) InputManager.instance = new InputManager();
        return InputManager.instance;
    }

    private handleKeyDown = (e: KeyboardEvent) => {
        this.keys.set(e.key, true);
    };
    private handleKeyUp = (e: KeyboardEvent) => {
        this.keys.set(e.key, false);
    };
    private handleMouseMove = (e: MouseEvent) => {
        this.mouseX = (e.clientX / window.innerWidth) * 2 - 1;
    };

    getInput(): InputState {
        const throttle = (this.keys.get('ArrowUp') || this.keys.get('w')) ? 1 : 0;
        const brake = (this.keys.get('ArrowDown') || this.keys.get('s') || this.keys.get(' ')) ? 1 : 0;
        let steer = this.mouseX;
        steer = Math.pow(Math.abs(steer), 1.2) * Math.sign(steer);
        return { throttle, brake, steer: Math.min(1, Math.max(-1, steer)) };
    }

    destroy() {
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        window.removeEventListener('mousemove', this.handleMouseMove);
    }
}
