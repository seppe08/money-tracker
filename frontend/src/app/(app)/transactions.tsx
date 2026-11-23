import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Link, router, useFocusEffect } from 'expo-router';

import {
  errorMessage,
  exportTransactionsCsvRequest,
  fetchCategories,
  fetchTransactions,
  type SortOrder,
  type Transaction,
  type TransactionQuery,
} from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { DateInput } from '@/components/DateInput';
import { TransactionRow } from '@/components/TransactionRow';
import { colors, radius, spacing } from '@/theme/colors';
import { downloadCsvFile } from '@/utils/export';
import {
  getTransactionRevision,
  subscribeTransactionCreated,
} from '@/utils/transaction-events';

const PAGE_SIZE = 50;

type KindFilter = 'all' | 'income' | 'expense';

const SORT_OPTIONS: { label: string; value: SortOrder }[] = [
  { label: 'Newest', value: 'date_desc' },
  { label: 'Oldest', value: 'date_asc' },
  { label: 'Amount: High to Low', value: 'amount_desc' },
  { label: 'Amount: Low to High', value: 'amount_asc' },
];

function isValidDateParam(val: string): boolean {
  if (!val) return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(val)) return false;
  const d = new Date(`${val}T00:00:00Z`);
  return !isNaN(d.getTime());
}

export default function TransactionsScreen() {
  const { authedRequest } = useAuth();

  // Screen-level filter states (never persisted to storage)
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [sort, setSort] = useState<SortOrder>('date_desc');

  const isDateRangeInvalid =
    isValidDateParam(fromDate) && isValidDateParam(toDate) && fromDate > toDate;
  const dateRangeError = isDateRangeInvalid
    ? 'From date must be on or before To date.'
    : null;

  // Available categories
  const [categories, setCategories] = useState<string[]>([]);

  // List data and pagination state
  const [dataState, setDataState] = useState<{
    queryKey: string;
    items: Transaction[];
    total: number;
  } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);

  const currentQueryKey = JSON.stringify({
    debouncedSearch: debouncedSearch.trim(),
    kind,
    selectedCategory,
    fromDate: isValidDateParam(fromDate) ? fromDate : '',
    toDate: isValidDateParam(toDate) ? toDate : '',
    sort,
    reloadKey,
  });

  const loading = !isDateRangeInvalid && dataState?.queryKey !== currentQueryKey;
  const transactions = dataState?.items ?? [];
  const total = dataState?.total ?? 0;

  const isFetchingMoreRef = useRef(false);
  const lastLoadedRevision = useRef(0);

  // Debounce search input by 300ms
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchText);
    }, 300);

    return () => {
      clearTimeout(timer);
    };
  }, [searchText]);

  // Load categories
  useEffect(() => {
    let active = true;

    fetchCategories(authedRequest)
      .then((cats) => {
        if (active && Array.isArray(cats)) {
          setCategories(cats);
        }
      })
      .catch(() => {
        // Category options are non-critical
      });

    return () => {
      active = false;
    };
  }, [authedRequest]);

  // Initial fetch and fetch when filters change
  useEffect(() => {
    let active = true;

    if (isDateRangeInvalid) {
      return;
    }

    const query: TransactionQuery = {
      limit: PAGE_SIZE,
      offset: 0,
      search: debouncedSearch.trim() || undefined,
      category: selectedCategory ?? undefined,
      kind: kind === 'all' ? undefined : kind,
      from_date: isValidDateParam(fromDate) ? fromDate : undefined,
      to_date: isValidDateParam(toDate) ? toDate : undefined,
      sort,
    };

    fetchTransactions(query, authedRequest)
      .then((data) => {
        if (!active) return;
        setDataState({
          queryKey: currentQueryKey,
          items: data.items,
          total: data.total,
        });
        setHasMore(data.items.length < data.total && data.items.length >= PAGE_SIZE);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(errorMessage(err));
        setDataState({
          queryKey: currentQueryKey,
          items: [],
          total: 0,
        });
      });

    return () => {
      active = false;
    };
  }, [
    authedRequest,
    currentQueryKey,
    debouncedSearch,
    fromDate,
    isDateRangeInvalid,
    kind,
    selectedCategory,
    sort,
    toDate,
  ]);

  // Infinite scroll onEndReached handler
  const handleLoadMore = useCallback(async () => {
    if (
      isFetchingMoreRef.current ||
      loading ||
      loadingMore ||
      refreshing ||
      !hasMore ||
      transactions.length >= total
    ) {
      return;
    }

    if (isDateRangeInvalid) {
      return;
    }

    isFetchingMoreRef.current = true;
    setLoadingMore(true);

    try {
      const query: TransactionQuery = {
        limit: PAGE_SIZE,
        offset: transactions.length,
        search: debouncedSearch.trim() || undefined,
        category: selectedCategory ?? undefined,
        kind: kind === 'all' ? undefined : kind,
        from_date: isValidDateParam(fromDate) ? fromDate : undefined,
        to_date: isValidDateParam(toDate) ? toDate : undefined,
        sort,
      };

      const data = await fetchTransactions(query, authedRequest);
      setDataState((prev) => {
        const prevItems = prev?.items ?? [];
        const existingIds = new Set(prevItems.map((t) => t.id));
        const fresh = data.items.filter((t) => !existingIds.has(t.id));
        return {
          queryKey: currentQueryKey,
          items: [...prevItems, ...fresh],
          total: data.total,
        };
      });

      const loadedCount = transactions.length + data.items.length;
      if (data.items.length < PAGE_SIZE || loadedCount >= data.total) {
        setHasMore(false);
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingMore(false);
      isFetchingMoreRef.current = false;
    }
  }, [
    authedRequest,
    currentQueryKey,
    debouncedSearch,
    fromDate,
    hasMore,
    isDateRangeInvalid,
    kind,
    loading,
    loadingMore,
    refreshing,
    selectedCategory,
    sort,
    toDate,
    total,
    transactions.length,
  ]);

  // Pull to refresh handler
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);

    try {
      fetchCategories(authedRequest)
        .then((cats) => {
          if (Array.isArray(cats)) {
            setCategories(cats);
          }
        })
        .catch(() => {});

      if (isDateRangeInvalid) {
        setRefreshing(false);
        return;
      }

      const query: TransactionQuery = {
        limit: PAGE_SIZE,
        offset: 0,
        search: debouncedSearch.trim() || undefined,
        category: selectedCategory ?? undefined,
        kind: kind === 'all' ? undefined : kind,
        from_date: isValidDateParam(fromDate) ? fromDate : undefined,
        to_date: isValidDateParam(toDate) ? toDate : undefined,
        sort,
      };

      const data = await fetchTransactions(query, authedRequest);
      setDataState({
        queryKey: currentQueryKey,
        items: data.items,
        total: data.total,
      });
      setHasMore(data.items.length < data.total && data.items.length >= PAGE_SIZE);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setRefreshing(false);
    }
  }, [
    authedRequest,
    currentQueryKey,
    debouncedSearch,
    fromDate,
    isDateRangeInvalid,
    kind,
    selectedCategory,
    sort,
    toDate,
  ]);

  // Reload when transactions change elsewhere in app
  useEffect(() => {
    return subscribeTransactionCreated(() => {
      lastLoadedRevision.current = getTransactionRevision();
      setReloadKey((k) => k + 1);
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (getTransactionRevision() > lastLoadedRevision.current) {
        lastLoadedRevision.current = getTransactionRevision();
        setReloadKey((k) => k + 1);
      }
    }, []),
  );

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/');
    }
  };

  const handleExportCsv = useCallback(async () => {
    setExporting(true);
    try {
      const query: TransactionQuery = {
        search: debouncedSearch.trim() || undefined,
        category: selectedCategory ?? undefined,
        kind: kind === 'all' ? undefined : kind,
        from_date: isValidDateParam(fromDate) ? fromDate : undefined,
        to_date: isValidDateParam(toDate) ? toDate : undefined,
        sort,
      };
      const csvData = await exportTransactionsCsvRequest(query, authedRequest);
      const downloaded = downloadCsvFile(
        csvData,
        `transactions_${new Date().toISOString().slice(0, 10)}.csv`,
      );
      if (!downloaded && Platform.OS !== 'web') {
        const rowCount = Math.max(0, csvData.trim().split('\n').length - 1);
        Alert.alert(
          'Export Ready',
          `Exported ${rowCount} transactions. On web browsers, CSV files download directly to your device.`,
        );
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setExporting(false);
    }
  }, [authedRequest, debouncedSearch, fromDate, kind, selectedCategory, sort, toDate]);

  const hasActiveFilters = Boolean(
    searchText ||
      kind !== 'all' ||
      selectedCategory !== null ||
      fromDate ||
      toDate ||
      sort !== 'date_desc',
  );

  const handleClearFilters = () => {
    setSearchText('');
    setDebouncedSearch('');
    setKind('all');
    setSelectedCategory(null);
    setFromDate('');
    setToDate('');
    setSort('date_desc');
  };

  const renderEmptyComponent = () => {
    if (loading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      );
    }

    if (error) {
      return (
        <View style={styles.messageBox}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setReloadKey((k) => k + 1)}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      );
    }

    if (dateRangeError) {
      return (
        <View style={styles.messageBox}>
          <Text style={styles.errorText}>{dateRangeError}</Text>
        </View>
      );
    }

    return (
      <View style={styles.messageBox}>
        <Text style={styles.emptyTitle}>No transactions found</Text>
        <Text style={styles.emptyText}>
          {hasActiveFilters
            ? 'No transactions match your search and filter criteria. Try adjusting or clearing your filters.'
            : 'Once transactions are added, they will show up here.'}
        </Text>
        {hasActiveFilters ? (
          <Pressable
            accessibilityRole="button"
            onPress={handleClearFilters}
            style={({ pressed }) => [
              styles.clearFiltersBtn,
              pressed && styles.pressed,
            ]}
          >
            <Text style={styles.clearFiltersBtnText}>Reset filters</Text>
          </Pressable>
        ) : null}
      </View>
    );
  };

  const renderFooterComponent = () => {
    if (loadingMore) {
      return (
        <View style={styles.footerLoader}>
          <ActivityIndicator size="small" color={colors.primary} />
        </View>
      );
    }

    if (!loading && transactions.length > 0 && !hasMore) {
      return (
        <View style={styles.footerEnd}>
          <Text style={styles.footerEndText}>
            All {total} {total === 1 ? 'transaction' : 'transactions'} loaded
          </Text>
        </View>
      );
    }

    return null;
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          onPress={handleBack}
          style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}
        >
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
        <Text style={styles.headerTitle}>Transactions</Text>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="Export transactions as CSV"
            accessibilityRole="button"
            disabled={exporting}
            onPress={() => void handleExportCsv()}
            style={({ pressed }) => [
              styles.exportButton,
              pressed && styles.pressed,
              exporting && styles.disabled,
            ]}
          >
            {exporting ? (
              <ActivityIndicator color={colors.primary} size="small" />
            ) : (
              <Text style={styles.exportButtonText}>Export</Text>
            )}
          </Pressable>
          <Link href="/add" asChild>
            <Pressable
              accessibilityLabel="Add transaction"
              accessibilityRole="button"
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
            >
              <Text style={styles.addButtonText}>+ Add</Text>
            </Pressable>
          </Link>
        </View>
      </View>

      <View style={styles.filtersContainer}>
        {/* Search input debounced ~300ms */}
        <View style={styles.searchWrapper}>
          <TextInput
            accessibilityLabel="Search transactions"
            autoCapitalize="none"
            autoCorrect={false}
            onChangeText={setSearchText}
            placeholder="Search description or category..."
            placeholderTextColor={colors.textMuted}
            selectionColor={colors.primary}
            style={styles.searchInput}
            value={searchText}
          />
          {searchText.length > 0 ? (
            <Pressable
              accessibilityLabel="Clear search"
              accessibilityRole="button"
              onPress={() => {
                setSearchText('');
                setDebouncedSearch('');
              }}
              style={({ pressed }) => [
                styles.clearSearchBtn,
                pressed && styles.pressed,
              ]}
            >
              <Text style={styles.clearSearchText}>✕</Text>
            </Pressable>
          ) : null}
        </View>

        {/* Kind toggle: All / Income / Expense */}
        <View style={styles.kindSegmentContainer}>
          <Pressable
            accessibilityLabel="All transactions"
            accessibilityRole="button"
            accessibilityState={{ selected: kind === 'all' }}
            onPress={() => setKind('all')}
            style={[
              styles.kindSegmentButton,
              kind === 'all' && styles.kindSegmentAllActive,
            ]}
          >
            <Text
              style={[
                styles.kindSegmentText,
                kind === 'all' && styles.kindSegmentAllTextActive,
              ]}
            >
              All
            </Text>
          </Pressable>

          <Pressable
            accessibilityLabel="Income transactions"
            accessibilityRole="button"
            accessibilityState={{ selected: kind === 'income' }}
            onPress={() => setKind('income')}
            style={[
              styles.kindSegmentButton,
              kind === 'income' && styles.kindSegmentIncomeActive,
            ]}
          >
            <Text
              style={[
                styles.kindSegmentText,
                kind === 'income' && styles.kindSegmentIncomeTextActive,
              ]}
            >
              Income
            </Text>
          </Pressable>

          <Pressable
            accessibilityLabel="Expense transactions"
            accessibilityRole="button"
            accessibilityState={{ selected: kind === 'expense' }}
            onPress={() => setKind('expense')}
            style={[
              styles.kindSegmentButton,
              kind === 'expense' && styles.kindSegmentExpenseActive,
            ]}
          >
            <Text
              style={[
                styles.kindSegmentText,
                kind === 'expense' && styles.kindSegmentExpenseTextActive,
              ]}
            >
              Expense
            </Text>
          </Pressable>
        </View>

        {/* Category chips from fetchCategories, single-select */}
        {categories.length > 0 ? (
          <View style={styles.categoriesWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryChipsScroll}
            >
              <Pressable
                accessibilityLabel="All categories"
                accessibilityRole="button"
                accessibilityState={{ selected: selectedCategory === null }}
                onPress={() => setSelectedCategory(null)}
                style={({ pressed }) => [
                  styles.categoryChip,
                  selectedCategory === null && styles.categoryChipActive,
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[
                    styles.categoryChipText,
                    selectedCategory === null && styles.categoryChipTextActive,
                  ]}
                >
                  All categories
                </Text>
              </Pressable>
              {categories.map((cat) => {
                const isSelected = selectedCategory === cat;
                return (
                  <Pressable
                    key={cat}
                    accessibilityLabel={`Category ${cat}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                    onPress={() => setSelectedCategory(isSelected ? null : cat)}
                    style={({ pressed }) => [
                      styles.categoryChip,
                      isSelected && styles.categoryChipActive,
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.categoryChipText,
                        isSelected && styles.categoryChipTextActive,
                      ]}
                    >
                      {cat}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        ) : null}

        {/* Date range using from_date and to_date */}
        <View style={styles.dateSection}>
          <View style={styles.dateInputsRow}>
            <DateInput
              accessibilityLabel="From date"
              label="From date"
              onChange={setFromDate}
              value={fromDate}
            />
            <DateInput
              accessibilityLabel="To date"
              label="To date"
              onChange={setToDate}
              value={toDate}
            />
            {fromDate || toDate ? (
              <Pressable
                accessibilityLabel="Clear date filters"
                accessibilityRole="button"
                onPress={() => {
                  setFromDate('');
                  setToDate('');
                }}
                style={({ pressed }) => [
                  styles.clearDatesBtn,
                  pressed && styles.pressed,
                ]}
              >
                <Text style={styles.clearDatesText}>Clear</Text>
              </Pressable>
            ) : null}
          </View>
          {dateRangeError ? (
            <Text style={styles.dateRangeErrorText}>{dateRangeError}</Text>
          ) : null}
        </View>

        {/* Sort order selector */}
        <View style={styles.sortSection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sortChipsScroll}
          >
            {SORT_OPTIONS.map((opt) => {
              const isSelected = sort === opt.value;
              return (
                <Pressable
                  key={opt.value}
                  accessibilityLabel={`Sort by ${opt.label}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSelected }}
                  onPress={() => setSort(opt.value)}
                  style={({ pressed }) => [
                    styles.sortChip,
                    isSelected && styles.sortChipActive,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.sortChipText,
                      isSelected && styles.sortChipTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>

        {/* Results count & reset filters */}
        <View style={styles.summaryBar}>
          <Text style={styles.summaryCount}>
            {loading
              ? 'Searching...'
              : `${total} ${total === 1 ? 'transaction' : 'transactions'}`}
          </Text>
          {hasActiveFilters ? (
            <Pressable
              accessibilityLabel="Reset all filters"
              accessibilityRole="button"
              onPress={handleClearFilters}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Text style={styles.resetFiltersText}>Reset filters</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Infinite scroll FlatList */}
      <FlatList
        contentContainerStyle={styles.listContent}
        data={transactions}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={renderEmptyComponent}
        ListFooterComponent={renderFooterComponent}
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            colors={[colors.primary]}
            onRefresh={handleRefresh}
            progressBackgroundColor={colors.surface}
            refreshing={refreshing}
            tintColor={colors.textMuted}
          />
        }
        renderItem={({ item, index }) => (
          <TransactionRow isFirst={index === 0} transaction={item} />
        )}
        style={styles.list}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.background,
    flex: 1,
  },
  header: {
    alignItems: 'center',
    borderBottomColor: colors.border,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  headerActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: spacing.xs,
  },
  exportButton: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 34,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  exportButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
  },
  disabled: {
    opacity: 0.6,
  },
  backButton: {
    paddingHorizontal: spacing.xs,
    paddingVertical: spacing.xs,
  },
  backButtonText: {
    color: colors.primary,
    fontSize: 15,
    fontWeight: '600',
  },
  addButton: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  addButtonText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  filtersContainer: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  searchWrapper: {
    justifyContent: 'center',
    position: 'relative',
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    color: colors.text,
    fontSize: 14,
    height: 42,
    paddingLeft: spacing.md,
    paddingRight: 40,
  },
  clearSearchBtn: {
    alignItems: 'center',
    height: 42,
    justifyContent: 'center',
    position: 'absolute',
    right: spacing.md,
    width: 28,
  },
  clearSearchText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },
  kindSegmentContainer: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 3,
  },
  kindSegmentButton: {
    alignItems: 'center',
    borderRadius: radius.sm,
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  kindSegmentAllActive: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderWidth: 1,
  },
  kindSegmentIncomeActive: {
    backgroundColor: 'rgba(61, 220, 151, 0.15)',
    borderColor: colors.primary,
    borderWidth: 1,
  },
  kindSegmentExpenseActive: {
    backgroundColor: 'rgba(255, 107, 107, 0.15)',
    borderColor: colors.danger,
    borderWidth: 1,
  },
  kindSegmentText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  kindSegmentAllTextActive: {
    color: colors.text,
    fontWeight: '600',
  },
  kindSegmentIncomeTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  kindSegmentExpenseTextActive: {
    color: colors.danger,
    fontWeight: '600',
  },
  categoriesWrapper: {
    // category container
  },
  categoryChipsScroll: {
    flexDirection: 'row',
    gap: spacing.xs,
    paddingVertical: 2,
  },
  categoryChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  categoryChipActive: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.primary,
  },
  categoryChipText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  categoryChipTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  sortSection: {
    paddingVertical: 2,
  },
  sortChipsScroll: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  sortChip: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  sortChipActive: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.primary,
  },
  sortChipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '500',
  },
  sortChipTextActive: {
    color: colors.primary,
    fontWeight: '600',
  },
  dateSection: {
    gap: spacing.xs,
  },
  dateInputsRow: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  clearDatesBtn: {
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    height: 40,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  clearDatesText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  dateRangeErrorText: {
    color: colors.danger,
    fontSize: 12,
  },
  summaryBar: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
  },
  summaryCount: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '500',
  },
  resetFiltersText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  list: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.lg,
    borderWidth: 1,
    flex: 1,
    marginBottom: spacing.lg,
    marginHorizontal: spacing.lg,
    overflow: 'hidden',
  },
  listContent: {
    flexGrow: 1,
  },
  centerContainer: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  messageBox: {
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
    justifyContent: 'center',
    padding: spacing.xl,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  emptyText: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  errorText: {
    color: colors.danger,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  retryText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  clearFiltersBtn: {
    backgroundColor: colors.surfaceMuted,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  clearFiltersBtnText: {
    color: colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  footerLoader: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  footerEnd: {
    alignItems: 'center',
    borderTopColor: colors.border,
    borderTopWidth: StyleSheet.hairlineWidth,
    justifyContent: 'center',
    paddingVertical: spacing.md,
  },
  footerEndText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  pressed: {
    opacity: 0.7,
  },
});
