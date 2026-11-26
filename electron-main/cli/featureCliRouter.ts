import type { BrowserWindow } from 'electron';
import { CliResponse, FeatureCliHandler } from './cliHelpers';
import { handleNavCli } from './navCliHandler';
import { handleWhiteboardCli } from './whiteboardCliHandler';
import { handleCardCli } from './cardCliHandler';
import { handleDrawerCli } from './drawerCliHandler';
import { handleDocumentCli } from './documentCliHandler';
import { handleHighlightCli } from './highlightCliHandler';
import { handleInboxCli } from './inboxCliHandler';
import { handleJournalCli } from './journalCliHandler';
import { handleTagCli } from './tagCliHandler';
import { handleSearchCli } from './searchCliHandler';
import { handleSystemCli } from './systemCliHandler';
import { handleUploadCli } from './uploadCliHandler';

const FEATURE_HANDLERS: Record<string, FeatureCliHandler> = {
  nav: handleNavCli,
  whiteboard: handleWhiteboardCli,
  card: handleCardCli,
  drawer: handleDrawerCli,
  document: handleDocumentCli,
  highlight: handleHighlightCli,
  inbox: handleInboxCli,
  journal: handleJournalCli,
  tag: handleTagCli,
  search: handleSearchCli,
  system: handleSystemCli,
  upload: handleUploadCli,
};

export async function handleFeatureCliAction(
  win: BrowserWindow,
  domain: string,
  action: string,
  params: Record<string, unknown>
): Promise<CliResponse> {
  const handler = FEATURE_HANDLERS[domain];
  if (!handler) {
    return {
      status: 404,
      body: { ok: false, error: `Unknown feature CLI domain: ${domain}` },
    };
  }
  return handler(win, action, params);
}
