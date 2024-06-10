const { app } = require('@azure/functions');
const axios = require("axios");

const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
const LINE_ACCESS_TOKEN = "YOUR TOKEN"

var carts = {}
const PRODUCTS = {
    1: {
        'name': "พาสต้าคาโบนาร่า",
        'price': 500,
        'image': "https://imgur.com/tSlvqpR.png"
    },
    2: {
        'name': "สลัดเซซาร์กับไก่ย่าง",
        'price': 180,
        'image': "https://imgur.com/2ooETOy.png"
    },
    3: {
        'name': "ช็อกโกแลตหน้านิ่ม",
        'price': 1000,
        'image': "https://imgur.com/cjhcSJQ.png"
    }
}

const DIALOGFLOW_EVENT = {
    CART_ADD: "cart.add",
    CART_CLEAR: "cart.clear",
    CART_SUBMIT: "cart.submit",
    CART_SHOW: "cart.show",
}

const replyCartItemsToLine = async (sessionID, replyToken = "") => {
    const itemPlaceHolder = {
        "type": "bubble",
        "header": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {
                    "type": "image",
                    "url": "",
                    "position": "relative",
                    "align": "center"
                }
            ]
        },
        "body": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {
                    "type": "text",
                    "text": "สินค้า ก."
                },
                {
                    "type": "separator"
                },
                {
                    "type": "text",
                    "text": "5 EA, 10 BTH"
                }
            ]
        },
        "footer": {
            "type": "box",
            "layout": "vertical",
            "contents": [
                {
                    "type": "text",
                    "text": "รวม ... บาท"
                }
            ]
        }
    }

    const items = []

    let message = ""
    const itemInCarts = Array.from(carts?.[sessionID] ?? [])
    if ((itemInCarts).length === 0) {
        message = "ไม่มีสินค้าในตะกร้า"
    } else {
        let cartAmount = 0;
        message += 'รายการสินค้า\n'
        let itemNumber = 1
        for (const cartItem of itemInCarts) {
            const product = PRODUCTS[cartItem.item_id]
            const productAmount = product.price * cartItem.qty;
            cartAmount += productAmount;
            message += `${itemNumber} ${product.name} (${cartItem.qty} x ${product.price}) = ${productAmount.toFixed(2)} บาท\n`
            itemNumber++;
            const bubbleMessage = { ...JSON.parse(JSON.stringify(itemPlaceHolder)) }

            bubbleMessage.header.contents[0].url = product.image;
            bubbleMessage.body.contents[0].text = product.name;
            bubbleMessage.body.contents[2].text = `จำนวนชิ้น ${cartItem.qty}, ราคาต่อชิ้น ${product.price}`;
            bubbleMessage.footer.contents[0].text = `${productAmount.toFixed(2)} บาท`;
            items.push(bubbleMessage)
        }
        message += `\nรวม ${cartAmount} บาท'`
    }
    const data = {
        replyToken,
        messages: [{
            type: "flex",
            "altText": "myCarouselMessage",
            contents: { "type": "carousel", "contents": items }
        }]
    }
    try {
        const headers = {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
        };
        const response = await axios.post(LINE_REPLY_URL, data, { headers: headers });
        console.log('Message sent: ', response.data);
    } catch (error) {
        console.error('Error sending message: ', error);
    }
}

const replyMessageToLine = async (message = "", replyToken = "") => {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_ACCESS_TOKEN}`
    };
    const data = {
        replyToken: replyToken,
        messages: [
            { type: 'text', text: message }
        ]
    };

    try {
        const response = await axios.post(LINE_REPLY_URL, data, { headers: headers });
        console.log('Message sent: ', response.data);
    } catch (error) {
        console.error('Error sending message: ', error);
    }
}

app.http('jaoPondCafeWebhook', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        const data = await request.json();
        const sessionID = data?.session ?? null;
        const replyToken = data?.originalDetectIntentRequest?.payload?.data?.replyToken ?? null;
        const actionName = data?.queryResult?.action ?? null;
        switch (actionName) {
            case DIALOGFLOW_EVENT.CART_ADD:
                if (!carts?.[sessionID])
                    carts[sessionID] = []
                // To access to params => data?.queryResult?.parameters?.*
                const itemToAddID = data?.queryResult?.parameters?.item_id;
                const cartItems = Array.from(carts[sessionID]);
                const existCartIndex = cartItems.findIndex(c => c.item_id === itemToAddID);
                // ถ้าเจอของเดิม += 1 
                if (existCartIndex >= 0) {
                    cartItems[existCartIndex].qty += 1;
                } else {
                    // ถ้าไม่เจอสร้างเป็น Item ใหม่
                    cartItems.push({ item_id: itemToAddID, qty: 1 })
                }
                carts[sessionID] = cartItems;
                break;
            case DIALOGFLOW_EVENT.CART_CLEAR:
                carts[sessionID] = [];
                replyMessageToLine('เคลียร์ตะกร้าแล้ว', replyToken)
                break;
            case DIALOGFLOW_EVENT.CART_SUBMIT:
                if (carts?.[sessionID] && carts?.[sessionID]?.length > 0) {
                    const endpoint = "https://657bfe88394ca9e4af1528b1.mockapi.io/products"
                    const cartItems = carts?.[sessionID]
                    for (let index = 0; index < cartItems.length; index++) {
                        const cartItem = cartItems[index];
                        const product = PRODUCTS[cartItem.item_id]
                        const response = await axios.post(endpoint, {
                            "product_id": cartItem.item_id,
                            "amount": cartItem.qty * product.price,
                            "qty": cartItem.qty
                        })
                    }
                    replyMessageToLine('Submit รายการแล้วรออาหารมาเสริฟใน 15 นาที', replyToken)
                } else {
                    replyMessageToLine('ไม่มีสินค้าในตะกร้า กรุณาเพิ่มสินค้าก่อน', replyToken)
                }
                carts[sessionID] = [];
                break;
            case DIALOGFLOW_EVENT.CART_SHOW:
                replyCartItemsToLine(sessionID, replyToken)
                break;
            default:
                break;
        }
        return { body: data };
    }
});