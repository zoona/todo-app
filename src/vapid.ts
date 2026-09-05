/**
 * 웹 푸시 서버 공개키.
 *
 * 공개키라서 코드에 그대로 둔다. 브라우저 번들에 어차피 실리고, 이 값만으로는
 * 알림을 보낼 수 없다. 짝이 되는 비밀키는 zoona/todo의 Actions secret에 있다.
 */
export const VAPID_PUBLIC_KEY =
  "BLhHxzoALq5jMIgaS4BYzSfwxDLZwrFR7O8kQzMxdWnwZ7W3BkjajCujnMo74z4VluieiD4wj91uDOcdvebTqco";
