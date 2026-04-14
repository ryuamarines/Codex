"use client";

import { isFirebaseConfigured } from "@/lib/firebase/client";

type CloudAuthControlsProps = {
  isLoggedIn: boolean;
  onCloudLoad: () => void;
  onForceCloudReplace: () => void;
  onGoogleSignOut: () => void;
  onGoogleSignIn: () => void;
};

export function CloudAuthControls({
  isLoggedIn,
  onCloudLoad,
  onForceCloudReplace,
  onGoogleSignOut,
  onGoogleSignIn
}: CloudAuthControlsProps) {
  if (isLoggedIn) {
    return (
      <>
        <button className="toolButton" type="button" onClick={onCloudLoad}>
          クラウド同期
        </button>
        <button className="toolButton" type="button" onClick={onForceCloudReplace}>
          この端末をクラウドで置き換え
        </button>
        <button className="toolButton" type="button" onClick={onGoogleSignOut}>
          ログアウト
        </button>
      </>
    );
  }

  return (
    <button
      className="toolButton"
      type="button"
      onClick={onGoogleSignIn}
      disabled={!isFirebaseConfigured()}
    >
      Googleでログイン
    </button>
  );
}
