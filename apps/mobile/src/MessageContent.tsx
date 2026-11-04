import { visualizationTheme } from './visualization-theme';
import { useState } from 'react';
import { Modal, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Markdown from 'react-native-markdown-display';
import { WebView } from 'react-native-webview';
import { nativeVisualizationDocument, visualizationLimit } from '@openfactory/core/visualization';
import { Button, Label, styles, useTheme } from './ui';

function Visualization({ html }: { html: string }) {
  const colors = useTheme();
  const [source, setSource] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [revision, setRevision] = useState(0);
  const wrapper = nativeVisualizationDocument(html, false, visualizationTheme(colors));
  if (new TextEncoder().encode(html).byteLength > visualizationLimit) {
    return (
      <View>
        <Label>Visual exceeds the 1 MB limit. Showing source.</Label>
        <Label>{html}</Label>
      </View>
    );
  }
  const frame = (
    <WebView
      key={revision}
      containerStyle={{ height: expanded ? undefined : 420, flex: expanded ? 1 : 0 }}
      source={{ html: wrapper }}
      style={{
        height: expanded ? undefined : 420,
        flex: expanded ? 1 : undefined,
        backgroundColor: colors.surface,
      }}
      originWhitelist={['*']}
      onShouldStartLoadWithRequest={(request) =>
        request.url === 'about:blank' || request.url === 'about:srcdoc'
      }
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      sharedCookiesEnabled={false}
      thirdPartyCookiesEnabled={false}
      setSupportMultipleWindows={false}
      javaScriptCanOpenWindowsAutomatically={false}
      mixedContentMode="never"
    />
  );
  return (
    <View style={styles.group}>
      <View style={styles.row}>
        <Button title={source ? 'Preview' : 'Source'} onPress={() => setSource(!source)} />
        <Button title="Reset" onPress={() => setRevision(revision + 1)} />
        <Button title="Expand" onPress={() => setExpanded(true)} />
      </View>
      {source ? <Label>{html}</Label> : frame}
      <Modal visible={expanded} onRequestClose={() => setExpanded(false)}>
        <SafeAreaView style={[styles.fill, { backgroundColor: colors.canvas }]}>
          <Button title="Close visualization" onPress={() => setExpanded(false)} />
          {expanded && frame}
        </SafeAreaView>
      </Modal>
    </View>
  );
}
export function MessageContent({ text }: { text: string }) {
  const colors = useTheme();
  const blocks = text.split(/(```openfactory-html\s*\n[\s\S]*?\n```)/g);
  return (
    <View style={styles.group}>
      {blocks.map((block, index) =>
        block.startsWith('```openfactory-html') ? (
          <Visualization
            key={index}
            html={block.replace(/^```openfactory-html\s*\n/, '').replace(/\n```$/, '')}
          />
        ) : (
          <Markdown
            key={index}
            style={{
              body: { color: colors.text, fontSize: 16, lineHeight: 24 },
              code_inline: { color: colors.text, backgroundColor: colors.inset },
              fence: { color: colors.text, backgroundColor: colors.inset },
              link: { color: colors.accent },
            }}
            onLinkPress={(url) => /^https?:\/\//i.test(url)}
          >
            {block}
          </Markdown>
        ),
      )}
    </View>
  );
}
