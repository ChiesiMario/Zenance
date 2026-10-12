import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { HelpCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';

interface EditSecurityQuestionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuestionId?: string;
  initialCustomQuestion?: string;
  onSave: (questionId: string, customQuestion: string | undefined, answer: string) => void;
}

export function EditSecurityQuestionDialog({
  open,
  onOpenChange,
  initialQuestionId = 'q_pet',
  initialCustomQuestion = '',
  onSave,
}: EditSecurityQuestionDialogProps) {
  const { t } = useTranslation();

  const [editSecQuestionId, setEditSecQuestionId] = useState(initialQuestionId);
  const [editCustomQuestion, setEditCustomQuestion] = useState(initialCustomQuestion);
  const [editSecAnswer, setEditSecAnswer] = useState('');

  useEffect(() => {
    if (open) {
      setEditSecQuestionId(initialQuestionId || 'q_pet');
      setEditCustomQuestion(initialCustomQuestion || '');
      setEditSecAnswer('');
    }
  }, [open, initialQuestionId, initialCustomQuestion]);

  const getSecurityQuestionLabel = (qId: string) => {
    if (!qId) return '';
    return t(`security.questions.${qId}`);
  };

  const handleSave = () => {
    if (editSecQuestionId === 'custom' && !editCustomQuestion.trim()) {
      toast.show(t('security.customQuestionRequired'));
      return;
    }
    if (!editSecAnswer.trim()) {
      toast.show(t('security.answerRequired'));
      return;
    }

    onSave(
      editSecQuestionId,
      editSecQuestionId === 'custom' ? editCustomQuestion.trim() : undefined,
      editSecAnswer.trim()
    );
    toast.show(t('security.securityQuestionUpdated'));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="z-[70]"
        className="z-[70] sm:max-w-[340px] max-w-[340px] p-5 gap-4"
      >
        <DialogHeader>
          <DialogTitle className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
            <HelpCircle className="size-5 text-primary" />
            <span>{t('security.editSecurityQuestion')}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground leading-relaxed pt-1">
            {t('security.securityQuestionDesc')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              {t('security.selectSecurityQuestion')}
            </label>
            <Select
              value={editSecQuestionId}
              onValueChange={(val) => val && setEditSecQuestionId(val)}
            >
              <SelectTrigger className="w-full h-9 text-xs">
                <SelectValue
                  className="truncate text-left flex-1"
                  placeholder={t('security.selectSecurityQuestion')}
                >
                  {getSecurityQuestionLabel(editSecQuestionId)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent align="start">
                <SelectItem value="q_pet">{t('security.questions.q_pet')}</SelectItem>
                <SelectItem value="q_school">{t('security.questions.q_school')}</SelectItem>
                <SelectItem value="q_city">{t('security.questions.q_city')}</SelectItem>
                <SelectItem value="q_movie">{t('security.questions.q_movie')}</SelectItem>
                <SelectItem value="q_friend">{t('security.questions.q_friend')}</SelectItem>
                <SelectItem value="custom">{t('security.questions.custom')}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {editSecQuestionId === 'custom' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground block mb-1">
                {t('security.customQuestionLabel')}
              </label>
              <Input
                placeholder={t('security.customQuestionPlaceholder')}
                value={editCustomQuestion}
                onChange={(e) => setEditCustomQuestion(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground block mb-1">
              {t('security.securityAnswerLabel')}
            </label>
            <Input
              placeholder={t('security.securityAnswerPlaceholder')}
              value={editSecAnswer}
              onChange={(e) => setEditSecAnswer(e.target.value)}
              className="h-9 text-xs font-mono"
            />
          </div>

          <Button className="w-full h-9 text-xs mt-2 cursor-pointer" onClick={handleSave}>
            {t('common.confirm', '確認儲存')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
