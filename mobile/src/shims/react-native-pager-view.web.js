/**
 * Web shim for react-native-pager-view (native-only module).
 * Renders children in a simple scrollable View on web.
 */
import React from 'react';
import { View, ScrollView } from 'react-native';

function PagerView({ children, style, initialPage, onPageSelected, onPageScroll, ...rest }) {
  const pages = React.Children.toArray(children);

  return (
    <ScrollView horizontal pagingEnabled style={style} {...rest}>
      {pages.map((page, i) => (
        <View key={i} style={{ flex: 1, width: '100%' }}>
          {page}
        </View>
      ))}
    </ScrollView>
  );
}

export default PagerView;
