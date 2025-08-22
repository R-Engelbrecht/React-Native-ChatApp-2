import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRoute } from '@react-navigation/native';
import axios from 'axios';
import React, { useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ngrok } from './apiConfig';
import { getMessagesByUser, insertMessages, openDatabase, updateLatestMessage, upsertChatUser,checkMessageExists } from './sqlite';



export default function Messages({ userData }) {
  const route = useRoute();
  const { chatPartnerID, name } = route.params;
  const userID = userData?.userID;

  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const flatlistRef = useRef(null);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [lastMessageId, setLastMessageId] = useState(0);

  const insets = useSafeAreaInsets();
  const INPUT_HEIGHT = 60;
  

  const loadMessages = async () => {
    if (!userID || !chatPartnerID) {
      console.error('Invalid userID or chatPartnerID:', { userID, chatPartnerID });
      return;
    }
    try {
      await upsertChatUser(Number(userID), userData.name || 'Current User', userData.email || 'user@example.com', '', new Date().toISOString(), 'sent');
      await upsertChatUser(Number(chatPartnerID), name || 'Chat Partner', 'partner@example.com', '', new Date().toISOString(), 'sent');

      const dbMessages = await getMessagesByUser(userID, chatPartnerID);
      console.log('dbMessages:', dbMessages);
      const formattedMessages = dbMessages.map(msg => ({
        id: msg.id.toString(),
        text: msg.message,
        sender: msg.senderID === Number(userID) ? 'me' : 'them',
       // timestamp: msg.timestamp,
        timestamp: new Date(msg.timestamp).toLocaleTimeString(),
      }));
      setMessages(formattedMessages);
      const validIds = dbMessages.map(m => Number(m.serverMessageId)).filter(id => !isNaN(id) && id > 0);
      setLastMessageId(validIds.length > 0 ? Math.max(...validIds) : 0);

      setTimeout(() => {
        flatlistRef.current?.scrollToOffset({ offset: 0, animated: false });
      }, 100);
    } catch (error) {
      console.error('Error loading messages2:', error);
    }
  };

  useEffect(() => {
    loadMessages();
  }, [userID, chatPartnerID]);

  useEffect(() => {
    if (!userID || !chatPartnerID) return;

    let isPolling = false;

    const pollInterval = setInterval(async () => {
      if (isPolling) return;
      isPolling = true;
      try {
        const token = await AsyncStorage.getItem('remember_token');
        if (!token) return;

        console.log('Polling with lastMessageId:', lastMessageId);
        const response = await axios.get(`${ngrok}/messages`, {
          params: { user_id: userID, chat_partner_id: chatPartnerID, last_id: lastMessageId },
          headers: { Authorization: `Bearer ${token}` },
        });

        const newMessages = response.data;
        console.log('New messages received:', newMessages.map(m => ({ id: m.id, message: m.message })));
        if (newMessages.length > 0) {
         for (const msg of newMessages) {
              // Skip if this serverMessageId already exists
              const exists = await checkMessageExists(msg.id);
              if (exists) continue;

              const dbMessage = {
                senderID: msg.sender_id,
                receiverID: msg.receiver_id,
                message: msg.message,
                timestamp: new Date(msg.timestamp).toISOString().slice(0, 19) + 'Z',
                status: 'sent',
                serverMessageId: msg.id,
              };
              await insertMessages(dbMessage);

              if (msg.sender_id === Number(chatPartnerID)) {
                await updateLatestMessage(Number(chatPartnerID), msg.message, dbMessage.timestamp, 'sent');
              }
            }
          const validIds = newMessages.map(m => Number(m.id)).filter(id => !isNaN(id) && id > 0);
          if (validIds.length > 0) {
            setLastMessageId(prevId => Math.max(prevId, ...validIds));
          }
          await loadMessages();
          setTimeout(() => {
            flatlistRef.current?.scrollToOffset({ offset: 0, animated: true });
          }, 100);
        }
      } catch (error) {
        console.error('Error polling messages:', error);
      } finally {
        isPolling = false;
      }
    }, 2000);

    return () => clearInterval(pollInterval);
  }, [userID, chatPartnerID, lastMessageId]);

  useEffect(() => {
    const showSubscription = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });

    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  

  const sendMessage = async () => {
    console.log('sendMessage called');
    if (isSending || !newMessage.trim()) {
      console.log('Message empty or sending in progress, ignoring');
      return;
    }
    if (!userID || !chatPartnerID) {
      console.error('Invalid userID or chatPartnerID:', { userID, chatPartnerID });
      return;
    }

    setIsSending(true);
    const messageText = newMessage.trim();
    setNewMessage('');

    const now = new Date();
    const formattedTimestamp = now.toISOString().slice(0, 19) + 'Z';

    const dbMessage = {
      senderID: Number(userID),
      receiverID: Number(chatPartnerID),
      message: messageText,
      timestamp: formattedTimestamp,
      status: 'sent',
      serverMessageId: null,
    };

    try {
      const insertedId = await insertMessages(dbMessage);
      console.log('Message inserted to DB:', { ...dbMessage, id: insertedId });

      await updateLatestMessage(Number(chatPartnerID), messageText, formattedTimestamp, 'sent');
      await upsertChatUser(Number(userID), userData.name || 'Current User', userData.email || 'user@example.com', '', formattedTimestamp, 'sent');
      await upsertChatUser(Number(chatPartnerID), name || 'Chat Partner', 'partner@example.com', messageText, formattedTimestamp, 'sent');

      const token = await AsyncStorage.getItem('remember_token');
      await axios.post(
        `${ngrok}/messages`,
        {
          sender_id: Number(userID),
          receiver_id: Number(chatPartnerID),
          message: messageText,
          timestamp: formattedTimestamp,
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      await loadMessages();
      setTimeout(() => {
        flatlistRef.current?.scrollToOffset({ offset: 0, animated: true });
      }, 100);
    } catch (e) {
      console.error('DB or server insert error:', e);
      setNewMessage(messageText);
    } finally {
      setIsSending(false);
    }
  };

  const renderMessage = ({ item }) => (
    <View
      style={[
        styles.message,
        item.sender === 'me' ? styles.myMessage : styles.theirMessage,
      ]}
    >
      <Text
        style={[
          styles.messageText,
          item.sender === 'me' ? styles.myMessageText : styles.theirMessageText,
        ]}
      >
        {item.text}
      </Text>
      <Text
        style={[
          styles.timestamp,
          item.sender === 'me' ? styles.myTimestamp : styles.theirTimestamp,
        ]}
      >
        {item.timestamp}
      </Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#252525ff' }}
      behavior={Platform.OS === 'android' ? 'paddingBottom' : keyboardHeight > 0 ? 'padding' : 'height'}
      keyboardVerticalOffset={insets.top + 44}
    >
      <View style={{ flex: 1 }}>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <Text style={styles.header}>Chat with {name}</Text>
        </TouchableWithoutFeedback>

        <View style={{ flex: 1 }}>
          <FlatList
            ref={flatlistRef}
            data={[...messages].reverse()}
            renderItem={renderMessage}
            keyExtractor={item => item.id.toString()}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: 20,
              flexGrow: 1,
              justifyContent: 'flex-end',
            }}
            inverted={true}
            onScroll={({ nativeEvent }) => {
              const yOffset = nativeEvent.contentOffset.y;
              setShowScrollToBottom(yOffset > 100);
            }}
            keyboardShouldPersistTaps="always"
          />

          {showScrollToBottom && (
          <TouchableOpacity
            onPress={() => flatlistRef.current?.scrollToOffset({ offset: 0, animated: true })}
            style={[
              styles.showScrollToBottomButton,
              {
                bottom:
                  keyboardHeight > 0
                    ? keyboardHeight + insets.bottom + INPUT_HEIGHT + 10 // 10px spacing above input
                    : insets.bottom + INPUT_HEIGHT + 10, // always above input
              },
            ]}
          >
            <Ionicons name="arrow-down" size={24} color="#fff" />
          </TouchableOpacity>
        )}

          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View
              style={[
                styles.inputContainer,
                {
                  paddingBottom: keyboardHeight > 0 ? keyboardHeight + insets.bottom + 20 : insets.bottom + 20,
                },
              ]}
            >
              <TextInput
                style={styles.input}
                value={newMessage}
                onChangeText={setNewMessage}
                placeholder="Type your message..."
                returnKeyType="send"
                onSubmitEditing={sendMessage}
              />
              <TouchableOpacity
              style={[styles.sendButton, isSending && styles.disabledButton]}
              onPress={sendMessage}
              disabled={isSending}
            >
              <Text style={styles.sendButtonText}>
                {isSending ? 'Sending...' : 'Send'}
              </Text>
            </TouchableOpacity>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: 30,
    paddingBottom: 20,
    fontSize: 18,
    fontWeight: 'bold',
    backgroundColor: '#2c2f30d5',
    color: '#fff',
    textAlign: 'center',
  },
  message: {
    marginVertical: 6,
    padding: 12,
    borderRadius: 12,
    maxWidth: '90%',
    minWidth: 100,
    //width: 200,
  },
  myMessage: {
    backgroundColor: '#474747ff',
    alignSelf: 'flex-end',
  },
  theirMessage: {
    backgroundColor: '#ffffffff',
    alignSelf: 'flex-start',
  },
  messageText: {
    fontSize: 16,
  },
  myMessageText: {
    color: '#f7f7f7ff', // White text for my messages
  },
  theirMessageText: {
    color: '#000000', // Black text for their messages
  },
  timestamp: {
    fontSize: 10,
    marginTop: 2,
    textAlign: 'right',
  },
  myTimestamp: {
    color: '#797979ff', // Light gray for my timestamps
  },
  theirTimestamp: {
    color: '#333333', // Dark gray for their timestamps
  },
  inputContainer: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingTop: 8,
    backgroundColor: '#141414ff',
    alignItems: 'center',
  },
  input: {
    flex: 1,
    backgroundColor: '#f7f7f7ff',
    paddingHorizontal: 10,
    borderRadius: 24,
    marginRight: 10,
    height: 40,
  },
  showScrollToBottomButton: {
    position: 'absolute',
    bottom: 90,
    right: 20,
    backgroundColor: '#224d5efa',
    borderRadius: 24,
    padding: 12,
    elevation: 5,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
 sendButton: {
  backgroundColor: '#16546dff',
  borderRadius: 24,
  paddingHorizontal: 16,
  paddingVertical: 8,
  alignItems: 'center',
  justifyContent: 'center',
  height: 40,
},
disabledButton: {
  opacity: 0.5,
},
sendButtonText: {
  color: '#fff',
  fontWeight: 'bold',
  fontSize: 16,
},

});