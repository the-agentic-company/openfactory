import { visualizationTheme } from '../visualization-theme';
import { useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { WebView } from 'react-native-webview';
import { type RuntimeClient } from '@openfactory/client';
import { appBridgeRequestSchema } from '@openfactory/protocol/app-bridge';
import { nativeVisualizationDocument } from '@openfactory/core/visualization';
import { Button, ErrorNotice, Label, styles, useTheme } from '../ui';

export function AgentApp({ client, id }: { client: RuntimeClient; id: string }) {
  const colors = useTheme();
  const cache = useQueryClient();
  const ref = useRef<WebView<unknown>>(null);
  const prompting = useRef(false);
  const app = useQuery({
    queryKey: ['agent-app', id],
    queryFn: () => client.call('apps.read', { id }),
    refetchInterval: 3000,
  });
  const [source, setSource] = useState(false);
  const [error, setError] = useState<unknown>(null);
  function reply(message: unknown) {
    ref.current?.injectJavaScript(
      `document.querySelector('iframe').contentWindow.postMessage(${JSON.stringify(message)},'*');true;`,
    );
  }
  function receive(raw: string) {
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    const parsed = appBridgeRequestSchema.safeParse(data);
    if (!parsed.success) {
      return;
    }
    const message = parsed.data;
    if (message.type === 'openfactory:database-query') {
      void client.call('apps.query', { id, statements: message.statements }).then(
        (result) =>
          reply({
            type: 'openfactory:database-result',
            version: 1,
            requestId: message.requestId,
            ...result,
          }),
        (cause: unknown) =>
          reply({
            type: 'openfactory:database-result',
            version: 1,
            requestId: message.requestId,
            error: cause instanceof Error ? cause.message : 'Query failed.',
          }),
      );
      return;
    }
    const reject = () => {
      prompting.current = false;
      reply({
        type: 'openfactory:agent-prompt-result',
        version: 1,
        requestId: message.requestId,
        status: 'rejected',
      });
    };
    if (prompting.current) {
      reply({
        type: 'openfactory:agent-prompt-result',
        version: 1,
        requestId: message.requestId,
        status: 'rejected',
      });
      return;
    }
    prompting.current = true;
    Alert.alert(
      'Send this request to your agent?',
      message.prompt,
      [
        { text: 'Cancel', style: 'cancel', onPress: reject },
        {
          text: 'Send',
          onPress: () => {
            void client
              .call('apps.prompt', { id, prompt: message.prompt, requestId: message.requestId })
              .then(
                () => {
                  reply({
                    type: 'openfactory:agent-prompt-result',
                    version: 1,
                    requestId: message.requestId,
                    status: 'sent',
                  });
                  void cache.invalidateQueries();
                },
                (cause: unknown) => {
                  setError(cause);
                  reject();
                },
              )
              .finally(() => {
                prompting.current = false;
              });
          },
        },
      ],
      { cancelable: true, onDismiss: reject },
    );
  }
  return (
    <View style={styles.group}>
      <View style={styles.row}>
        <Button title={source ? 'Preview app' : 'Show source'} onPress={() => setSource(!source)} />
        <Button
          title="Refresh app"
          busy={app.isFetching}
          onPress={() => {
            void app.refetch();
          }}
        />
      </View>
      <ErrorNotice error={app.error ?? error} />
      {app.data &&
        (source ? (
          <Label>{app.data.html}</Label>
        ) : (
          <WebView<unknown>
            ref={ref}
            containerStyle={{ height: 560, flex: 0 }}
            key={app.data.revision}
            source={{
              html: nativeVisualizationDocument(app.data.html, true, visualizationTheme(colors)),
            }}
            style={{ height: 560, backgroundColor: colors.surface }}
            onMessage={(event) => receive(event.nativeEvent.data)}
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
        ))}
    </View>
  );
}
