# api-proxy

Tools for proxying API calls across some kind of messaging channel.

Steps:

1. The client boots up the server inside a web worker, iframe or other environment.
2. The server creates the root API object and passes it to `makeProxyServer`. This causes the server to send an initial update to the client.
3. The client is listening to messages from the server. Once it gets the initial message, it passes that into `makeProxyClient`, which returns a proxy for the server root API object.

From then on, any time the client or server sends a message, the outer user-controlled code should pass those messages along to the client or server proxy controller objects.
