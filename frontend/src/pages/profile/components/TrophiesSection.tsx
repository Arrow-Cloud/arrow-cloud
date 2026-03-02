import React, { useState, useEffect, useCallback } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { GripVertical, Trophy, Save, RotateCcw } from 'lucide-react';
import { getUserTrophies, updateTrophyOrder, type UserTrophy } from '../../../services/api';
import { getTierStyles } from '../../../components/TrophyCase';

interface DraggableTrophyProps {
  trophy: UserTrophy;
  index: number;
  isInDisplaySlot: boolean;
  onDragStart: (index: number) => void;
  onDragOver: (e: React.DragEvent, index: number) => void;
  onDragEnd: () => void;
  isDragging: boolean;
  dragOverIndex: number | null;
}

const DraggableTrophy: React.FC<DraggableTrophyProps> = ({
  trophy,
  index,
  isInDisplaySlot,
  onDragStart,
  onDragOver,
  onDragEnd,
  isDragging,
  dragOverIndex,
}) => {
  const styles = getTierStyles(trophy.tier as any);
  const isDropTarget = dragOverIndex === index;

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(e, index)}
      onDragEnd={onDragEnd}
      className={`
        relative flex flex-col items-center p-3 rounded-lg cursor-grab active:cursor-grabbing
        transition-all duration-200 select-none
        ${isDropTarget ? 'ring-2 ring-primary ring-offset-2 ring-offset-base-100' : ''}
        ${isDragging ? 'opacity-50' : ''}
        ${isInDisplaySlot ? 'bg-base-200/80' : 'bg-base-300/40'}
      `}
      style={{
        border: `2px solid ${isInDisplaySlot ? styles.borderColor : 'transparent'}`,
      }}
    >
      {/* Drag handle indicator */}
      <div className="absolute top-1 right-1 text-base-content/30">
        <GripVertical className="w-4 h-4" />
      </div>

      {/* Position badge for display slots */}
      {isInDisplaySlot && (
        <div className="absolute top-1 left-1 badge badge-primary badge-xs">
          {index + 1}
        </div>
      )}

      {/* Trophy icon */}
      <div
        className={`w-16 h-16 flex items-center justify-center rounded-lg`}
        style={{
          border: `2px solid ${styles.borderColor}`,
          boxShadow: trophy.tier !== 'common' ? styles.boxShadow : undefined,
        }}
      >
        {trophy.imageUrl ? (
          <img src={trophy.imageUrl} alt={trophy.name} className="w-14 h-14 object-contain" />
        ) : (
          <Trophy
            className={styles.iconColor}
            size={40}
            strokeWidth={trophy.tier === 'legendary' ? 2.5 : trophy.tier === 'epic' ? 2 : 1.5}
          />
        )}
      </div>

      {/* Trophy name */}
      <div
        className={`mt-2 text-xs font-medium text-center px-2 py-1 rounded ${styles.textColor}`}
        style={{
          background: styles.backgroundColor,
          borderColor: styles.borderColor,
        }}
      >
        {trophy.name}
      </div>
    </div>
  );
};

export const TrophiesSection: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [trophies, setTrophies] = useState<UserTrophy[]>([]);
  const [originalOrder, setOriginalOrder] = useState<UserTrophy[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const { formatMessage } = useIntl();

  const MAX_DISPLAY_TROPHIES = 8;

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const response = await getUserTrophies();
        if (mounted) {
          setTrophies(response.trophies);
          setOriginalOrder(response.trophies);
        }
      } catch (e: any) {
        if (mounted) {
          setError(
            e.message ||
              formatMessage({
                defaultMessage: 'Failed to load trophies',
                id: '1JtbJO',
                description: 'Error message shown when loading trophies fails',
              }),
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [formatMessage]);

  const handleDragStart = useCallback((index: number) => {
    setDragIndex(index);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    setDragOverIndex(index);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      setTrophies((prev) => {
        const newTrophies = [...prev];
        const [draggedTrophy] = newTrophies.splice(dragIndex, 1);
        newTrophies.splice(dragOverIndex, 0, draggedTrophy);
        return newTrophies;
      });
      setHasChanges(true);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  }, [dragIndex, dragOverIndex]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      // Create trophy orders based on current position
      const trophyOrders = trophies.map((trophy, index) => ({
        trophyId: trophy.id,
        displayOrder: index,
      }));

      const response = await updateTrophyOrder(trophyOrders);
      setTrophies(response.trophies);
      setOriginalOrder(response.trophies);
      setHasChanges(false);
    } catch (e: any) {
      setError(
        e.message ||
          formatMessage({
            defaultMessage: 'Failed to save trophy order',
            id: 'zA4z8x',
            description: 'Error message shown when saving trophy order fails',
          }),
      );
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setTrophies(originalOrder);
    setHasChanges(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="loading loading-spinner loading-lg text-primary"></span>
      </div>
    );
  }

  if (error) {
    return <div className="alert alert-error">{error}</div>;
  }

  if (trophies.length === 0) {
    return (
      <div className="text-center py-12">
        <Trophy className="w-16 h-16 mx-auto text-base-content/30 mb-4" />
        <h3 className="text-lg font-semibold text-base-content/70">
          <FormattedMessage
            defaultMessage="No Trophies Yet"
            id="MfLQN4"
            description="Title shown when user has no trophies"
          />
        </h3>
        <p className="text-base-content/50 mt-2">
          <FormattedMessage
            defaultMessage="Unlocked trophies will display here."
            id="wGZZ+M"
            description="Description shown when user has no trophies"
          />
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Instructions */}
      <div className="text-sm text-base-content/70">
        <FormattedMessage
          defaultMessage="Drag and drop to reorder your trophies. The first {count} trophies will be displayed on your profile."
          id="Ztv8Vl"
          description="Instructions for reordering trophies"
          values={{ count: MAX_DISPLAY_TROPHIES }}
        />
      </div>

      {/* Trophy grid */}
      <div className="relative">
        {/* Divider between visible and hidden trophies */}
        {trophies.length > MAX_DISPLAY_TROPHIES && (
          <div
            className="absolute left-0 right-0 border-t-2 border-dashed border-primary/30 z-10"
            style={{
              top: `calc(${Math.ceil(MAX_DISPLAY_TROPHIES / 4)} * (100% / ${Math.ceil(trophies.length / 4)}) - 8px)`,
            }}
          />
        )}

        <div className="grid grid-cols-4 gap-3">
          {trophies.map((trophy, index) => (
            <DraggableTrophy
              key={trophy.id}
              trophy={trophy}
              index={index}
              isInDisplaySlot={index < MAX_DISPLAY_TROPHIES}
              onDragStart={handleDragStart}
              onDragOver={handleDragOver}
              onDragEnd={handleDragEnd}
              isDragging={dragIndex === index}
              dragOverIndex={dragOverIndex}
            />
          ))}
        </div>
      </div>

      {/* Hidden trophies label */}
      {trophies.length > MAX_DISPLAY_TROPHIES && (
        <div className="text-center text-sm text-base-content/50 pt-2">
          <FormattedMessage
            defaultMessage="{count} trophies hidden from profile"
            id="aSDNdQ"
            description="Count of trophies not shown on profile"
            values={{ count: trophies.length - MAX_DISPLAY_TROPHIES }}
          />
        </div>
      )}

      {/* Action buttons */}
      <div className="flex gap-3 pt-4 border-t border-base-300/30">
        <button
          className="btn btn-primary btn-sm"
          onClick={handleSave}
          disabled={saving || !hasChanges}
        >
          {saving ? (
            <>
              <span className="loading loading-spinner loading-xs"></span>
              <FormattedMessage
                defaultMessage="Saving..."
                id="xH7Yfe"
                description="Button label while saving trophy order"
              />
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <FormattedMessage
                defaultMessage="Save Order"
                id="/74Al3"
                description="Button label for saving trophy order"
              />
            </>
          )}
        </button>
        <button
          className="btn btn-outline btn-sm"
          onClick={handleReset}
          disabled={saving || !hasChanges}
        >
          <RotateCcw className="w-4 h-4" />
          <FormattedMessage
            defaultMessage="Reset"
            id="SNYJQP"
            description="Button label for resetting trophy order"
          />
        </button>
      </div>
    </div>
  );
};

export default TrophiesSection;
