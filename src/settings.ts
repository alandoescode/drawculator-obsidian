import { App, PluginSettingTab } from 'obsidian';
import Drawculator from './main';

export interface DrawculatorSettings {
	expressionPreview: boolean;
}

export const DEFAULT_SETTINGS: DrawculatorSettings = {
	expressionPreview: true,
};

export class SettingTab extends PluginSettingTab {
	plugin: Drawculator;

	constructor(app: App, plugin: Drawculator) {
		super(app, plugin);
		this.plugin = plugin;
	}

	getSettingDefinitions() {
		return [
            {
                name: 'Enable expression preview',
                desc: 'see what the ai sees',
                control: {
					type: 'toggle' as const,
                    key: 'expressionPreview',
					defaultValue: true,
                },
            }
        ]
	}
}
