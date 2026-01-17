// frontend/src/App.js
import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import axios from 'axios';
import * as XLSX from 'xlsx-js-style';
import { saveAs } from 'file-saver';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFilter, faSortUp, faSortDown, faFileExcel, faFileUpload } from '@fortawesome/free-solid-svg-icons';
import './App.css';

function App() {
  const [data, setData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeFilters, setActiveFilters] = useState({});
  const [filterSelections, setFilterSelections] = useState({});
  const [openDropdown, setOpenDropdown] = useState(null);
  const filterDropdownRef = useRef(null);
  const filterIconRefs = useRef({});
  const [filterDropdownPosition, setFilterDropdownPosition] = useState({ top: 0, left: 0 });
  const [overdueCount, setOverdueCount] = useState(0);
  const [sortConfig, setSortConfig] = useState({ key: 'Data Limite', direction: 'ascending' });
  const [selectedFileName, setSelectedFileName] = useState('');

  const tableHeaders = useMemo(() => [
    'Chamado',
    'Numero Referencia',
    'Contratante',
    'Serviço',
    'Status',
    'Data Limite',
    'Cliente',
    'CNPJ / CPF',
    'Cidade',
    'Técnico',
    'Prestador',
    'Justificativa do Abono',
  ], []);

  const allowedStatuses = useMemo(() => [
    'ENCAMINHADA',
    'EM TRANSFERÊNCIA',
    'EM CAMPO',
    'REENCAMINHADO',
    'PROCEDIMENTO TÉCNICO'
  ], []);

  const normalizeForComparison = useCallback((str) => {
    if (typeof str !== 'string' || str === null) return ''; // Garante que não é null/undefined
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().trim();
  }, []);

  // Esta função agora é usada para normalizar status para comparação
  const normalizeStatusValue = useCallback((status) => {
    const normalized = normalizeForComparison(status);
    // Mapeia status normalizados para os valores exatos da lista permitida
    if (normalized.includes('ENCAMINHADA')) return 'ENCAMINHADA';
    if (normalized.includes('EM TRANSFERENCIA')) return 'EM TRANSFERÊNCIA';
    if (normalized.includes('EM CAMPO')) return 'EM CAMPO';
    if (normalized.includes('REENCAMINHADO')) return 'REENCAMINHADO';
    if (normalized.includes('PROCEDIMENTO TECNICO')) return 'PROCEDIMENTO TÉCNICO';
    return status; // Retorna o original se não houver normalização específica
  }, [normalizeForComparison]);

  // Função para formatar a Data Limite para DD/MM/AAAA
  const formatDataLimite = useCallback((dateString) => {
    if (!dateString) return '';
    try {
      // Tenta parsear com o formato DD/MM/YYYY HH:MM:SS ou DD/MM/YYYY
      const parts = dateString.match(/(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}):(\d{2}))?/);
      if (parts) {
        const [, day, month, year] = parts;
        return `${day}/${month}/${year}`;
      }
      // Fallback para Date object se o regex falhar
      const date = new Date(dateString);
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('pt-BR');
      }
    } catch (e) {
      console.error("Erro ao formatar data:", dateString, e);
    }
    return dateString; // Retorna a string original se não conseguir formatar
  }, []);

  // Função para formatar CNPJ/CPF (agora o backend já remove "=""")
  const formatCnpjCpf = useCallback((value) => {
    if (!value) return '';
    const cleaned = String(value).replace(/\D/g, ''); // Remove tudo que não é dígito
    if (cleaned.length === 11) {
      return cleaned.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); // CPF
    }
    if (cleaned.length === 14) {
      return cleaned.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'); // CNPJ
    }
    return value; // Retorna o valor original se não for CPF nem CNPJ
  }, []);

  // Efeito para calcular o contador de OSs em atraso (AGORA CONTA TODOS OS ATRASADOS)
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Zera a hora para comparar apenas a data

    const count = filteredData.filter(row => {
      const dataLimiteStr = row['Data Limite'];
      if (!dataLimiteStr) return false;

      const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (!parts) return false;

      const [, day, month, year] = parts;
      const dataLimite = new Date(Number(year), Number(month) - 1, Number(day));
      dataLimite.setHours(0, 0, 0, 0);

      // Atrasado se a data limite for anterior a hoje
      return dataLimite < today;
    }).length;

    setOverdueCount(count);
  }, [filteredData]);

  // Efeito para fechar o dropdown de filtro ao clicar fora
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target)) {
        // Verifica se o clique não foi em nenhum ícone de filtro
        const clickedOnFilterIcon = Object.values(filterIconRefs.current).some(ref => ref && ref.contains(event.target));
        if (!clickedOnFilterIcon) {
          setOpenDropdown(null);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    setSelectedFileName(file.name);
    setLoading(true);
    setError(null);
    setData([]);
    setFilteredData([]);
    setActiveFilters({});
    setFilterSelections({});
    setOpenDropdown(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:3001';
      const response = await axios.post(`${backendUrl}/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      setData(response.data);
      // Ao carregar novos dados, redefinir os filtros para aplicar o filtro de status inicial
      setActiveFilters({});
      setFilterSelections({});
    } catch (err) {
      console.error('Erro ao carregar o arquivo:', err);
      setError('Erro ao carregar o arquivo. Verifique o formato ou tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // Efeito para aplicar filtros e ordenação
  useEffect(() => {
    if (data.length === 0) {
      setFilteredData([]);
      return;
    }

    let processedData = [...data];

    // 1. Filtragem de Status Permanente (APLICADA PRIMEIRO E SEMPRE)
    processedData = processedData.filter(row => {
      const status = row['Status'];
      // Garante que status não é undefined/null antes de normalizar e incluir
      return status && allowedStatuses.includes(normalizeStatusValue(status));
    });

    // 2. Aplicação de outros filtros ativos
    Object.keys(activeFilters).forEach(columnKey => {
      const filterValues = activeFilters[columnKey];
      if (filterValues.length > 0) {
        processedData = processedData.filter(row => {
          const cellValue = row[columnKey];
          // Garante que cellValue não é undefined/null antes de normalizar
          return cellValue && filterValues.includes(normalizeForComparison(cellValue));
        });
      }
    });

    // 3. Ordenação
    if (sortConfig.key) {
      processedData.sort((a, b) => {
        const aValue = a[sortConfig.key] !== undefined && a[sortConfig.key] !== null ? a[sortConfig.key] : '';
        const bValue = b[sortConfig.key] !== undefined && b[sortConfig.key] !== null ? b[sortConfig.key] : '';

        // Lógica específica para 'Data Limite'
        if (sortConfig.key === 'Data Limite') {
          const dateA = new Date(aValue.split('/').reverse().join('-'));
          const dateB = new Date(bValue.split('/').reverse().join('-'));
          if (dateA < dateB) return sortConfig.direction === 'ascending' ? -1 : 1;
          if (dateA > dateB) return sortConfig.direction === 'ascending' ? 1 : -1;
          return 0;
        }

        // Ordenação padrão para outros tipos
        if (aValue < bValue) return sortConfig.direction === 'ascending' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }

    setFilteredData(processedData);
  }, [data, activeFilters, sortConfig, allowedStatuses, normalizeForComparison, normalizeStatusValue]);


  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const toggleFilterDropdown = (columnKey, event) => {
    event.stopPropagation(); // Impede que o clique feche o dropdown imediatamente
    if (openDropdown === columnKey) {
      setOpenDropdown(null);
    } else {
      setOpenDropdown(columnKey);
      // Calcula a posição do dropdown
      const iconRect = event.currentTarget.getBoundingClientRect();
      setFilterDropdownPosition({
        top: iconRect.bottom + window.scrollY + 5, // 5px abaixo do ícone
        left: iconRect.left + window.scrollX,
      });

      // Popula as opções de filtro para a coluna selecionada
      const uniqueValues = [...new Set(data.map(row => row[columnKey]))]
        .filter(value => value !== undefined && value !== null && value !== '') // Remove valores vazios/nulos
        .map(value => normalizeForComparison(value)) // Normaliza para comparação
        .sort(); // Ordena alfabeticamente

      // Mapeia de volta para os valores originais para exibição, se necessário
      // Ou simplesmente usa os valores normalizados para as opções
      const displayValues = [...new Set(data.map(row => row[columnKey]))]
        .filter(value => value !== undefined && value !== null && value !== '')
        .sort((a, b) => String(a).localeCompare(String(b), 'pt-BR', { sensitivity: 'base' })); // Ordena para exibição

      setFilterSelections(prev => ({
        ...prev,
        [columnKey]: prev[columnKey] || uniqueValues.map(val => ({ value: val, display: displayValues.find(dVal => normalizeForComparison(dVal) === val) || val, checked: true }))
      }));
    }
  };

  const handleFilterOptionChange = (columnKey, value) => {
    setFilterSelections(prev => ({
      ...prev,
      [columnKey]: prev[columnKey].map(option =>
        option.value === value ? { ...option, checked: !option.checked } : option
      )
    }));
  };

  const applyFilter = (columnKey) => {
    const selectedOptions = filterSelections[columnKey]
      .filter(option => option.checked)
      .map(option => option.value); // Usa o valor normalizado para o filtro

    setActiveFilters(prev => ({
      ...prev,
      [columnKey]: selectedOptions
    }));
    setOpenDropdown(null);
  };

  const clearFilter = (columnKey) => {
    setActiveFilters(prev => {
      const newFilters = { ...prev };
      delete newFilters[columnKey];
      return newFilters;
    });
    setFilterSelections(prev => ({
      ...prev,
      [columnKey]: prev[columnKey].map(option => ({ ...option, checked: true }))
    }));
    setOpenDropdown(null);
  };

  const getRowClassByDataLimite = useCallback((row) => {
    const dataLimiteStr = row['Data Limite'];
    const justificativaAbono = row['Justificativa do Abono'];

    if (!dataLimiteStr) return '';

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (!parts) return '';

    const [, day, month, year] = parts;
    const dataLimite = new Date(Number(year), Number(month) - 1, Number(day));
    dataLimite.setHours(0, 0, 0, 0);

    // Lógica para "FALTA ABONAR" (Roxo)
    // Se a data limite já passou E a justificativa está vazia ou é "FALTA ABONAR"
    const isFaltaAbonar = dataLimite < today && (justificativaAbono === '' || normalizeForComparison(justificativaAbono) === 'FALTA ABONAR');
    if (isFaltaAbonar) {
      return 'overdue-strong'; // Agora "FALTA ABONAR" também é vermelho forte
    }

    // Lógica para Atrasado (Vermelho forte)
    if (dataLimite < today) {
      return 'overdue-strong';
    }

    // Lógica para Vencendo Hoje (Amarelo)
    if (dataLimite.getTime() === today.getTime()) {
      return 'due-today';
    }

    return '';
  }, [normalizeForComparison]);

  const getCellContentAndClassName = useCallback((header, row) => {
    let content = row[header];
    let className = '';

    if (header === 'Data Limite') {
      content = formatDataLimite(content);
    } else if (header === 'CNPJ / CPF') {
      content = formatCnpjCpf(content);
    }

    // Lógica para "FALTA ABONAR" na célula específica
    if (header === 'Justificativa do Abono') {
      const dataLimiteStr = row['Data Limite'];
      const justificativaAbono = row['Justificativa do Abono'];

      if (dataLimiteStr) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
        if (parts) {
          const [, day, month, year] = parts;
          const dataLimite = new Date(Number(year), Number(month) - 1, Number(day));
          dataLimite.setHours(0, 0, 0, 0);

          const isFaltaAbonarCondition = dataLimite < today && (justificativaAbono === '' || normalizeForComparison(justificativaAbono) === 'FALTA ABONAR');
          if (isFaltaAbonarCondition) {
            content = 'FALTA ABONAR'; // Exibe o texto "FALTA ABONAR"
            // A classe de cor da célula é controlada pela classe da linha agora (overdue-strong)
          }
        }
      }
    }

    return { content, className };
  }, [formatDataLimite, formatCnpjCpf, normalizeForComparison]);


  const exportToExcel = useCallback(() => {
    if (filteredData.length === 0) {
      alert('Nenhum dado para exportar.');
      return;
    }

    // Filtra para incluir apenas itens pendentes de hoje (atrasados e vencendo hoje)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dataToExport = filteredData.filter(row => {
      const dataLimiteStr = row['Data Limite'];
      if (!dataLimiteStr) return false;

      const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
      if (!parts) return false;

      const [, day, month, year] = parts;
      const dataLimite = new Date(Number(year), Number(month) - 1, Number(day));
      dataLimite.setHours(0, 0, 0, 0);

      // Inclui se a data limite for anterior ou igual a hoje
      return dataLimite <= today;
    });

    if (dataToExport.length === 0) {
      alert('Nenhum item pendente de hoje para exportar.');
      return;
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);

    // Aplica estilos de cor às células
    dataToExport.forEach((row, rowIndex) => {
      const rowClass = getRowClassByDataLimite(row);
      const cellStyle = {};

      if (rowClass === 'overdue-strong') {
        cellStyle.fill = { fgColor: { rgb: "FF0000" } }; // Vermelho intenso
        cellStyle.font = { color: { rgb: "FFFFFF" } }; // Texto branco
      } else if (rowClass === 'due-today') {
        cellStyle.fill = { fgColor: { rgb: "FFFF00" } }; // Amarelo
        cellStyle.font = { color: { rgb: "333333" } }; // Texto escuro
      }

      // Aplica o estilo a todas as células da linha
      tableHeaders.forEach((header, colIndex) => {
        const cellRef = XLSX.utils.encode_cell({ r: rowIndex + 1, c: colIndex }); // +1 para pular o cabeçalho
        if (!ws[cellRef]) ws[cellRef] = {};
        ws[cellRef].s = cellStyle; // 's' para style
      });

      // Lógica específica para a célula "FALTA ABONAR" dentro da coluna "Justificativa do Abono"
      const justificativaAbonoHeader = 'Justificativa do Abono';
      const justificativaAbonoColIndex = tableHeaders.indexOf(justificativaAbonoHeader);
      if (justificativaAbonoColIndex !== -1) {
        const dataLimiteStr = row['Data Limite'];
        const justificativaAbonoValue = row['Justificativa do Abono'];

        if (dataLimiteStr) {
          const todayForAbono = new Date();
          todayForAbono.setHours(0, 0, 0, 0);

          const parts = dataLimiteStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
          if (parts) {
            const [, day, month, year] = parts;
            const dataLimite = new Date(Number(year), Number(month) - 1, Number(day));
            dataLimite.setHours(0, 0, 0, 0);

            const isFaltaAbonarCondition = dataLimite < todayForAbono && (justificativaAbonoValue === '' || normalizeForComparison(justificativaAbonoValue) === 'FALTA ABONAR');
            if (isFaltaAbonarCondition) {
              const cellRef = XLSX.utils.encode_cell({ r: rowIndex + 1, c: justificativaAbonoColIndex });
              if (!ws[cellRef]) ws[cellRef] = {};
              ws[cellRef].v = 'FALTA ABONAR'; // Garante que o texto seja "FALTA ABONAR"
              ws[cellRef].s = {
                fill: { fgColor: { rgb: "FF0000" } }, // Vermelho intenso para a célula também
                font: { color: { rgb: "FFFFFF" }, bold: true }
              };
            }
          }
        }
      }
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pendentes Hoje");
    const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const dataBlob = new Blob([excelBuffer], { type: 'application/octet-stream' });
    saveAs(dataBlob, 'pendentes_hoje.xlsx');
  }, [filteredData, getRowClassByDataLimite, tableHeaders, normalizeForComparison]);


  return (
    <div className="App">
      <header className="App-header">
        <h1>Tabela de Ordens de Serviço</h1>
        <div className="file-upload-container">
          <label htmlFor="file-upload" className="custom-file-upload">
            <FontAwesomeIcon icon={faFileUpload} />
            {selectedFileName ? `Arquivo: ${selectedFileName}` : 'Carregar CSV'}
          </label>
          <input
            id="file-upload"
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            style={{ display: 'none' }}
          />
          {selectedFileName && <span className="file-name-display">{selectedFileName}</span>}
        </div>
        <div className="action-buttons">
          <button onClick={exportToExcel} className="export-button" disabled={filteredData.length === 0}>
            <FontAwesomeIcon icon={faFileExcel} />
            Exportar Pendentes Hoje
          </button>
          {overdueCount > 0 && (
            <div className="overdue-count-container">
              {overdueCount} OS(s) em Atraso
            </div>
          )}
        </div>
        {loading && <p>Carregando...</p>}
        {error && <p className="error-message">{error}</p>}
      </header>

      <div className="data-table-container">
        <table className="data-table">
          <thead>
            <tr>
              {tableHeaders.map((header) => (
                <th key={header} className={`col-${normalizeForComparison(header).toLowerCase().replace(/ /g, '-')}`}>
                  <div className="header-content">
                    <span className="sortable-header" onClick={() => handleSort(header)}>
                      {header}
                      {sortConfig.key === header && (
                        <FontAwesomeIcon
                          icon={sortConfig.direction === 'ascending' ? faSortUp : faSortDown}
                          className="sort-icon"
                        />
                      )}
                    </span>
                    <FontAwesomeIcon
                      icon={faFilter}
                      className={`filter-icon ${activeFilters[header] && activeFilters[header].length > 0 ? 'filter-active' : ''}`}
                      onClick={(e) => toggleFilterDropdown(header, e)}
                      ref={el => filterIconRefs.current[header] = el}
                    />
                  </div>
                  {openDropdown === header && (
                    <div
                      className="filter-dropdown"
                      ref={filterDropdownRef}
                      style={{ top: filterDropdownPosition.top, left: filterDropdownPosition.left }}
                    >
                      <div className="filter-options-container">
                        {filterSelections[header] && filterSelections[header].map(option => (
                          <label key={option.value} className="filter-option">
                            <input
                              type="checkbox"
                              checked={option.checked}
                              onChange={() => handleFilterOptionChange(header, option.value)}
                            />
                            {option.display}
                          </label>
                        ))}
                      </div>
                      <div className="filter-actions">
                        <button onClick={() => applyFilter(header)}>Aplicar</button>
                        <button onClick={() => clearFilter(header)}>Limpar</button>
                      </div>
                    </div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredData.length > 0 ? (
              filteredData.map((row, rowIndex) => (
                <tr key={rowIndex} className={getRowClassByDataLimite(row)}>
                  {tableHeaders.map((header) => {
                    const { content, className } = getCellContentAndClassName(header, row);
                    return (
                      <td key={header} className={className}>
                        {content}
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={tableHeaders.length} style={{ textAlign: 'center' }}>
                  {loading ? 'Carregando dados...' : 'Nenhum dado disponível. Faça o upload de um arquivo CSV.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default App;
