import React from 'react';
import { SettingsModal } from './SettingsModal';
import { LocalAISetupModal } from './LocalAISetupModal';
import { DesktopAISetupModal } from './DesktopAISetupModal';
import { useApp } from '@/stores/AppContext';
import { AppUpdateModal } from './AppUpdateModal';

interface AssistantModalsProps {
  isSettingsOpen: boolean;
  onCloseSettings: () => void;
  isLocalAISetupOpen: boolean;
  onCloseLocalAISetup: () => void;
  isUpdateModalOpen: boolean;
  onCloseUpdateModal: () => void;
}

export const AssistantModals: React.FC<AssistantModalsProps> = ({
  isSettingsOpen,
  onCloseSettings,
  isLocalAISetupOpen,
  onCloseLocalAISetup,
  isUpdateModalOpen,
  onCloseUpdateModal,
}) => {
  const { checkAIStatus } = useApp();
  const isAndroid = typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);
  return (
    <>
      <SettingsModal isOpen={isSettingsOpen} onClose={onCloseSettings} />
      {isAndroid ? (
        <LocalAISetupModal isOpen={isLocalAISetupOpen} onClose={onCloseLocalAISetup} />
      ) : (
        <DesktopAISetupModal
          isOpen={isLocalAISetupOpen}
          onClose={onCloseLocalAISetup}
          onReady={() => void checkAIStatus()}
        />
      )}
      <AppUpdateModal isOpen={isUpdateModalOpen} onClose={onCloseUpdateModal} />
    </>
  );
};
