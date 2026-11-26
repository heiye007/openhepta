import { registerCardsApiHandlers } from './cardsApi';
import { registerDocumentsApiHandlers } from './documentsApi';
import { registerHighlightsApiHandlers } from './highlightsApi';
import { registerLocalFileApiHandlers } from './localFileApi';
import { registerPropertiesApiHandlers } from './propertiesApi';
import { registerSystemApiHandlers } from './systemApi';
import { registerTagsApiHandlers } from './tagsApi';
import { registerWhiteboardsApiHandlers } from './whiteboardsApi';

export function registerAllApiHandlers(): void {
  registerCardsApiHandlers();
  registerWhiteboardsApiHandlers();
  registerDocumentsApiHandlers();
  registerHighlightsApiHandlers();
  registerTagsApiHandlers();
  registerPropertiesApiHandlers();
  registerLocalFileApiHandlers();
  registerSystemApiHandlers();
}
