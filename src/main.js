import { mount } from 'svelte';
import './appearance.js';
import './theme.css';
import App from './App.svelte';
import './style.css';
mount(App, { target: document.getElementById('app') });
