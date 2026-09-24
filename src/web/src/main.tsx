import { render } from 'preact';
import { App } from './App';
import './styles.css';
import './mobile-presentation.css';
import './presentation-actions.css';
import './settings.css';
import './editor.css';

render(<App />, document.getElementById('app')!);
