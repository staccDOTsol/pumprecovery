import {
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'http';

@WebSocketGateway({
  namespace: '/coins',
  cors: {
    origin: [
      'https://pump.fun',
      'https://www.pump.fun',
      'https://beta.pump.fun',
      'https://devnet.pump.fun',
      process.env.FRONTEND_DOMAIN,
      'http://localhost:3000',
    ],
    credentials: true,
  },
})
export class CoinsGateway {
  @WebSocketServer()
  server: Server;

  emitNewKingOfTheHill(data: any) {
    console.log('new king of the hill', data);
    this.server.emit('NewKingOfTheHill', data);
  }
}
