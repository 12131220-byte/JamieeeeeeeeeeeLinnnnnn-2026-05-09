import { Pose } from "@/types/types";
import { Camera } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { WebView } from "react-native-webview";

interface HumanPoseProps {
  width?: number;
  height?: number;
  enableSkeleton?: boolean;
  enableKeyPoints?: boolean;
  color?: string;
  mode?: "single" | "multiple";
  scoreThreshold?: number;
  isBackCamera?: boolean;
  flipHorizontal?: boolean;
  onPoseDetected?: (pose: Pose) => void;
  isFullScreen?: boolean;
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  message: {
    color: "#fff",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 16,
  },
  error: {
    color: "#f87171",
  },
  webview: {
    flex: 1,
    backgroundColor: "#000",
  },
});

export default function HumanPose(p: HumanPoseProps) {
  const [loading, setLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const webviewRef = useRef<WebView>(null);

  const onPoseDetected = (pose: Pose) => {
    if (p.onPoseDetected) {
      p.onPoseDetected(pose);
    }
  };

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === "granted");
    })();
  }, []);

  useEffect(() => {
    setLoading(true);
    setHasError(false);
  }, [p.enableSkeleton, p.enableKeyPoints, p.color, p.mode, p.scoreThreshold, p.isBackCamera, p.flipHorizontal, p.isFullScreen]);

  const blazePose = "https://pose.vinhintw.com";
  const webViewUrl = `${blazePose}/?enableSkeleton=${
    p.enableSkeleton === true ? p.enableSkeleton : "false"
  }&enableKeyPoints=${
    p.enableKeyPoints === true ? p.enableKeyPoints : "false"
  }&color=${p.color ? p.color : ""}&mode=${p.mode ? p.mode : ""}&scoreThreshold=${
    p.scoreThreshold ? p.scoreThreshold : ""
  }&isBackCamera=${p.isBackCamera ? p.isBackCamera : ""}&flipHorizontal=${
    p.flipHorizontal ? p.flipHorizontal : ""
  }&isFullScreen=${p.isFullScreen ? p.isFullScreen : ""}`;

  if (hasPermission === null) {
    return (
      <View style={styles.wrapper}>
        <ActivityIndicator size="large" color="#fff" />
        <Text style={styles.message}>請求相機權限中...</Text>
      </View>
    );
  }

  if (hasPermission === false || hasError) {
    return (
      <View style={styles.wrapper}>
        <Text style={[styles.message, styles.error]}>
          無法取得相機或 WebView 服務，請檢查權限與網路連線。
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {loading && (
        <View style={styles.wrapper}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.message}>正在初始化姿勢檢測...</Text>
        </View>
      )}
      <WebView
        ref={webviewRef}
        key={webViewUrl}
        style={styles.webview}
        source={{ uri: webViewUrl }}
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType={"grant"}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        allowsFullscreenVideo
        onLoadStart={() => {
          setLoading(true);
          console.log("blazePose WebView loading");
        }}
        onLoadEnd={() => {
          setLoading(false);
          console.log("blazePose WebView loaded");
        }}
        onRenderProcessGone={(syntheticEvent) => {
          console.warn("WebView render process gone:", syntheticEvent.nativeEvent);
          setHasError(false);
          setLoading(true);
          try {
            webviewRef.current?.reload();
          } catch (e) {
            console.warn(e);
          }
        }}
        onContentProcessDidTerminate={(syntheticEvent) => {
          console.warn("WebView content process terminated:", syntheticEvent.nativeEvent);
          setHasError(false);
          setLoading(true);
          try {
            webviewRef.current?.reload();
          } catch (e) {
            console.warn(e);
          }
        }}
        onError={(syntheticEvent) => {
          console.error("WebView error:", syntheticEvent.nativeEvent);
          setHasError(true);
          setLoading(false);
        }}
        onHttpError={(syntheticEvent) => {
          console.error("WebView HTTP error:", syntheticEvent.nativeEvent.statusCode);
          setHasError(true);
          setLoading(false);
        }}
        onMessage={(event) => {
          try {
            const pose = JSON.parse(event.nativeEvent.data);
            onPoseDetected(pose);
          } catch (e) {
            console.log(e);
          }
        }}
      />
    </View>
  );
}