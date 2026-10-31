import { PhotoCraftApp } from './app/PhotoCraftApp';

function bootstrap() {
  const root = document.getElementById('root') || document.body;
  new PhotoCraftApp(root);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
