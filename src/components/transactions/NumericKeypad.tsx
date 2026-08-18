import { useRef, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Delete, CalendarDays, Check, Equal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface Props {
  value: string;
  onChange: (val: string) => void;
  onSubmit: () => void;
  date: string;
  onDateChange: (date: string) => void;
}

const safeEvaluate = (expr: string): string => {
  try {
    // Only allow numbers and basic math operators
    if (!/^[0-9+\-*/.\s]+$/.test(expr)) return expr;
    // Prevent trailing operators before eval
    if (/[+\-*/.]$/.test(expr)) return expr;
    // eslint-disable-next-line no-new-func
    const result = new Function('return ' + expr)();
    if (typeof result === 'number' && !isNaN(result)) {
      // Format to avoid long decimals
      return parseFloat(result.toFixed(4)).toString();
    }
  } catch (e) {
    // ignore
  }
  return expr;
};

export function NumericKeypad({ value, onChange, onSubmit, date, onDateChange }: Props) {
  const { t } = useTranslation();
  const dateInputRef = useRef<HTMLInputElement>(null);

  const isExpression = useMemo(() => {
    return /[+\-*/]/.test(value) && !/^[+-]?\d+(\.\d+)?$/.test(value);
  }, [value]);

  const handleKeyPress = (key: string) => {
    if (key === 'C') {
      onChange('');
      return;
    }
    
    if (key === 'DEL') {
      onChange(value.slice(0, -1));
      return;
    }

    if (key === '=') {
      if (isExpression) {
        onChange(safeEvaluate(value));
      } else {
        onSubmit();
      }
      return;
    }

    const operators = ['+', '-', '*', '/'];
    
    // Prevent multiple operators in a row
    if (operators.includes(key) && operators.includes(value.slice(-1))) {
      onChange(value.slice(0, -1) + key);
      return;
    }
    
    // Prevent starting with an operator (except minus)
    if (value === '' && operators.includes(key) && key !== '-') {
      return;
    }

    // Replace '*' with '×' and '/' with '÷' for display? 
    // We keep it as standard chars for eval, we can display it differently in the input if we want.

    onChange(value + key);
  };

  const today = new Date().toISOString().split('T')[0];
  const dateDisplay = date === today ? t('add.today', 'Today') : date.slice(5); // e.g. 08-18

  return (
    <div className="grid grid-cols-4 gap-2 w-full mx-auto max-w-[350px] h-64">
      
      {/* Row 1 */}
      <div className="relative w-full h-full col-span-4">
        <Input 
          ref={dateInputRef}
          type="date" 
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
        />
        <Button variant="ghost" className="w-full h-full flex gap-2 items-center justify-center p-0 rounded-xl bg-white/5 text-zinc-300 hover:bg-white/10 hover:text-white pointer-events-none transition-colors">
          <CalendarDays className="size-5" />
          <span className="text-sm uppercase tracking-wider font-medium">{dateDisplay}</span>
        </Button>
      </div>

      {/* Row 2 */}
      <Button variant="ghost" className="w-full h-full text-2xl font-mono rounded-xl bg-white/5 text-white hover:bg-white/15 hover:text-white transition-colors" onClick={() => handleKeyPress('1')}>1</Button>
      <Button variant="ghost" className="w-full h-full text-2xl font-mono rounded-xl bg-white/5 text-white hover:bg-white/15 hover:text-white transition-colors" onClick={() => handleKeyPress('2')}>2</Button>
      <Button variant="ghost" className="w-full h-full text-2xl font-mono rounded-xl bg-white/5 text-white hover:bg-white/15 hover:text-white transition-colors" onClick={() => handleKeyPress('3')}>3</Button>
      <Button variant="ghost" className="w-full h-full rounded-xl bg-white/5 text-red-400 hover:bg-white/15 hover:text-red-300 transition-colors" onClick={() => handleKeyPress('DEL')}>
        <Delete className="size-5" />
      </Button>

      {/* Row 3 */}
      <Button variant="ghost" className="w-full h-full text-2xl font-mono rounded-xl bg-white/5 text-white hover:bg-white/15 hover:text-white transition-colors" onClick={() => handleKeyPress('4')}>4</Button>
      <Button variant="ghost" className="w-full h-full text-2xl font-mono rounded-xl bg-white/5 text-white hover:bg-white/15 hover:text-white transition-colors" onClick={() => handleKeyPress('5')}>5</Button>
      <Button variant="ghost" className="w-full h-full text-2xl font-mono rounded-xl bg-white/5 text-white hover:bg-white/15 hover:text-white transition-colors" onClick={() => handleKeyPress('6')}>6</Button>
      <Button variant="ghost" className="w-full h-full text-xl rounded-xl bg-white/5 text-white hover:bg-white/15 hover:text-white transition-colors" onClick={() => handleKeyPress('-')}>-</Button>

      {/* Row 4 */}
      <Button variant="ghost" className="w-full h-full text-2xl font-mono rounded-xl bg-white/5 text-white hover:bg-white/15 hover:text-white transition-colors" onClick={() => handleKeyPress('7')}>7</Button>
      <Button variant="ghost" className="w-full h-full text-2xl font-mono rounded-xl bg-white/5 text-white hover:bg-white/15 hover:text-white transition-colors" onClick={() => handleKeyPress('8')}>8</Button>
      <Button variant="ghost" className="w-full h-full text-2xl font-mono rounded-xl bg-white/5 text-white hover:bg-white/15 hover:text-white transition-colors" onClick={() => handleKeyPress('9')}>9</Button>
      <Button variant="ghost" className="w-full h-full text-xl rounded-xl bg-white/5 text-white hover:bg-white/15 hover:text-white transition-colors" onClick={() => handleKeyPress('+')}>+</Button>
      
      {/* Row 5 */}
      <Button variant="ghost" className="w-full h-full text-2xl font-mono rounded-xl bg-white/5 text-white hover:bg-white/15 hover:text-white transition-colors" onClick={() => handleKeyPress('.')}>.</Button>
      <Button variant="ghost" className="w-full h-full text-2xl font-mono rounded-xl bg-white/5 text-white hover:bg-white/15 hover:text-white transition-colors" onClick={() => handleKeyPress('0')}>0</Button>
      <Button variant="ghost" className="w-full h-full text-xl font-mono rounded-xl bg-white/5 tracking-widest text-white hover:bg-white/15 hover:text-white transition-colors" onClick={() => handleKeyPress('00')}>00</Button>
      <Button 
        variant="ghost" 
        className={cn("w-full h-full rounded-xl flex gap-1 items-center justify-center transition-colors", 
          isExpression ? "bg-white/5 text-white hover:bg-white/15" : "bg-white text-black hover:bg-zinc-200 shadow-md"
        )} 
        onClick={() => handleKeyPress('=')}
      >
        {isExpression ? <Equal className="size-6" /> : <Check className="size-6" />}
      </Button>
      
    </div>
  );
}
